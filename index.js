import express from 'express';
import data from './data.json' assert { type: "json" };
import cors from 'cors';
import {io} from "socket.io-client";


const app = express();

const output = {};
const orders = {};

app.use(cors({credentials: true, origin: 'http://scalplist.tk',}));

app.get('/orders-bybit', function(req,resp) {
    resp.send(orders);
});
app.get('/test', function(req,resp) {
    resp.send(output);
});

const symbols = data.data;

const link = (s) => {
    let limit = 200; //3000
    // if(s === 'BTCUSDT' || s === 'ETHUSDT') {
    //     limit = 5000;
    // }
    return `https://api.bybit.com/spot/v3/public/quote/depth?symbol=${s}&limit=${limit}`
};

const api = async (s) => {
    try {
        const response = await fetch(link(s));
        const value = await response.json();
        return value;
    } catch {
        return false;
    }
};
// digitsAmount
const f = (x) => {
    let afterDot = (x.toString().includes('.')) ? (x.toString().split('.').pop().length) : (x.toString().length);
    let beforeDot = (x.toString().includes('.')) ? (x.toString().split('.').shift().length) : (0);
    let digitsAmount = afterDot + beforeDot;

    return digitsAmount;
};

// >1000
const firstGroup = (x) => {
    const val = x / 10;

    if(val.toString().includes('.')) {
        return false;
    }
    return true;
};

//digits amount <=3
const secondGroup = (x) => {
    let afterDot = (x.toString().includes('.')) ? (x.toString().split('.').pop().length) : (x.toString().length);
    let beforeDot = (x.toString().includes('.')) ? (x.toString().split('.').shift().length) : (0);
    let digitsAmount = afterDot + beforeDot;
    if(digitsAmount <= 2) {
        return true;
    }

    const val = x.toString().split('');
    if(val[val.length - 1] === '0') {
        return true;
    }
    return false;
};

const thirdGroup = (x, digitsAmount) => {
    let afterDot = (x.toString().includes('.')) ? (x.toString().split('.').pop().length) : (x.toString().length);
    let beforeDot = (x.toString().includes('.')) ? (x.toString().split('.').shift().length) : (0);
    let length = afterDot + beforeDot;
    if(length === digitsAmount - 2) {
        return true;
    }

    return false;
};


const checkSize = (item) => {
    if( (+item[0] * +item[1]) > 50000) {
        return true;
    }
    return false;
};

const searchOrders = (arr) => {
    try {
        const current = +arr[0][0];
        const digitsAmount = Math.max(...[f(+arr[0][0]), f(+arr[1][0]), f(+arr[2][0]), f(+arr[3][0])]);
        for (let item of arr) {
            const diff = Math.abs( (+item[0] / current) - 1);
            if(diff < 0.1) {
                if(+item[0] > 1000) {
                    if(firstGroup(+item[0])) {
                        if(checkSize(item)) {
                            return item;
                        }
                    }
                } else if(digitsAmount <= 3) {
                    if(secondGroup(+item[0])) {
                        if(checkSize(item)) {
                            return item;
                        }
                    }
                } else {
                    if(thirdGroup(+item[0], digitsAmount)) {
                        if(checkSize(item)) {
                            return item;
                        }
                    }
                }
            } else {
                break;
            }
        }
        return [];
    } catch {
        return [];
    }
};

let step = 0;
setInterval(async()=>{
    const sym = symbols[step];
    const apiData = await api(sym);

    if(apiData === false) return; 

    const asks = searchOrders(apiData.result.asks);
    const bids = searchOrders(apiData.result.bids);
    if(!!output[sym] && (asks.length > 0 || bids.length > 0) ) {
        if(output[sym][0][0] === +asks[0]) {
            output[sym][0][1] = Math.round(+asks[0] * +asks[1]);
            output[sym][0][3] = Math.floor(Date.now() / 1000) - output[sym][0][2];
            if(output[sym][0][3] > 900) {
                if(!!orders[sym]) {
                    orders[sym]['asks'] = output[sym][0];
                } else {
                    orders[sym] = {
                        asks: output[sym][0],
                    };
                }
            }
            if(output[sym][0][1] < 50000) {
                delete(orders[sym]['asks']);
            }
        } else {
            output[sym][0] = [+asks[0], Math.round(+asks[0] * +asks[1]), Math.floor(Date.now() / 1000), 0];
            if(!!orders[sym] && !!orders[sym]['asks']) {
                delete(orders[sym]['asks']);
            }
        }

        if(output[sym][1][0] === +bids[0]) {
            output[sym][1][1] = Math.round(+bids[0] * +bids[1]);
            output[sym][1][3] = Math.floor(Date.now() / 1000) - output[sym][1][2];
            if(output[sym][1][3] > 900) {
                if(!!orders[sym]) {
                    orders[sym]['bids'] = output[sym][1];
                } else {
                    orders[sym] = {
                        bids: output[sym][1],
                    };
                }
            }
            if(output[sym][1][1] < 50000) {
                delete(orders[sym]['bids']);
            }
        } else {
            output[sym][1] = [+bids[0], Math.round(+bids[0] * +bids[1]), Math.floor(Date.now() / 1000), 0];
            if(!!orders[sym] && !!orders[sym]['bids']) {
                delete(orders[sym]['bids']);
            }
        }

    } else {
        if(+asks[0] > 0 || +bids[0] > 0) {
            output[sym] = [
                [+asks[0], +asks[0] * +asks[1], Math.floor(Date.now() / 1000), 0],
                [+bids[0], +bids[0] * +bids[1], Math.floor(Date.now() / 1000), 0],
            ];
        } else {
            output[sym] = [
                [null, null, Math.floor(Date.now() / 1000), 0],
                [null, null, Math.floor(Date.now() / 1000), 0]
            ];
        }
    }

    step++;
    if(step > symbols.length - 1) {
        step = 0;
    }
}, 2000);


const socket = io("http://localhost:8100", {
    path: '/socket-bybit'
});
// const socket = io("https://scalplist.com", {
//     path: '/socket-bybit'
// });


const listener = (value) => {
    const tick = JSON.parse(value);

    if(!!orders[tick.symbol]) {
        if(!!orders[tick.symbol]['asks'] && tick.price >= orders[tick.symbol]['asks'][0]) {
            if(!!output[tick.symbol]) {
                output[tick.symbol][0][3] = 0;
                output[tick.symbol][0][0] = null;
                output[tick.symbol][0][1] = null;
            }
            delete(orders[tick.symbol]['asks']);
        }
        if(!!orders[tick.symbol]['bids'] && tick.price <= orders[tick.symbol]['bids'][0]) {
            if(!!output[tick.symbol]) {
                output[tick.symbol][1][3] = 0;
                output[tick.symbol][1][0] = null;
                output[tick.symbol][1][1] = null;
            }
            delete(orders[tick.symbol]['bids']);
        }
    }
}

socket.on("data", listener);


app.listen(7100);
