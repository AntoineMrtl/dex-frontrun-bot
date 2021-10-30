var Web3 = require("web3");
var abiDecoder = require("abi-decoder");

var createWeb3 = async function(global) {
    try {
        web3 = new Web3(new Web3.providers.HttpProvider(global.http_provider));
        web3Ws = new Web3(
            new Web3.providers.WebsocketProvider(global.websocket)
        );

        pancakeRouter = new web3.eth.Contract(
            global.router_abi,
            global.router_addr
        );
        pancakeFactory = new web3.eth.Contract(
            global.factory_abi,
            global.factory_addr
        );
  
        abiDecoder.addABI(global.router_abi);
            
        global.web3 = web3;
        global.web3Ws = web3Ws;
        global.router = pancakeRouter;
        global.factory = pancakeFactory;

        return global;
    } catch (error) {
        throw "Create Web 3 error".red;
    }
}

module.exports = {
    createWeb3
}