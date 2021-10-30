/**
 * Perform a front-running attack on an exchange
 */
const abiDecoder = require("abi-decoder");
const Tx = require("ethereumjs-tx").Transaction;
const colors = require("colors");
const utils = require("./libs/utils.js");
const web3Utils = require("./libs/web3.js");
const func = require('./libs/funcIdent.js')
const BigNumber = require('bignumber.js');

const {
  NETWORK,
  CHAIN_SYMBOL,
  PANCAKE_ROUTER_ADDRESS,
  PANCAKE_FACTORY_ADDRESS,
  PANCAKE_ROUTER_ABI,
  PANCAKE_FACTORY_ABI,
  PANCAKE_POOL_ABI,
  HTTP_PROVIDER_LINK,
  WEBSOCKET_PROVIDER_LINK,
  ETHERSCAN_API,
  TRIGGERED_METHOD,
  GAS_LIMIT
} = require("./data/constants.js");

const { 
  PRIVATE_KEY,
  GAS_PRICE, 
  EXCHANGE_PERCENT_FEES,
  INPUT_TOKEN_ADDRESS, 
  OUTPUT_TOKENS_ADDRESS, 
  MAXIMUM_WAITING_TIME_SEC,
  MINIMUM_PERCENT_PROFIT, 
  SLIPPAGE, 
  SWAP_BASE_TOKEN_AMOUNT, 
  MIN_TRIGGER_AMOUNT } = require("./data/env.js");

// one gwei
const ONE_GWEI = 1e9;
var attack_started = false;

var subscription;

// define a global namespace to be used by all the libraries
global = {
  started : false,
  
  tokens_info : [],
  pools_info : [],
  tokens_abi_req : [],
  
  NETWORK : NETWORK,

  EXCHANGE_PERCENT_FEES : EXCHANGE_PERCENT_FEES,
  TRIGGERED_METHOD : TRIGGERED_METHOD,
  GAS_LIMIT : GAS_LIMIT,

  http_provider : HTTP_PROVIDER_LINK,
  websocket : WEBSOCKET_PROVIDER_LINK,
  ETHERSCAN_API : ETHERSCAN_API,

  router_abi : PANCAKE_ROUTER_ABI,
  router_addr : PANCAKE_ROUTER_ADDRESS,

  factory_abi : PANCAKE_FACTORY_ABI,
  factory_addr : PANCAKE_FACTORY_ADDRESS,

  input_token_addr : INPUT_TOKEN_ADDRESS, 
  OUTPUT_TOKENS_ADDRESS : OUTPUT_TOKENS_ADDRESS, 
  pool_abi : PANCAKE_POOL_ABI, 

  MAXIMUM_WAITING_TIME_SEC : MAXIMUM_WAITING_TIME_SEC,

  MIN_TRIGGER_AMOUNT : MIN_TRIGGER_AMOUNT,
  SWAP_BASE_TOKEN_AMOUNT : SWAP_BASE_TOKEN_AMOUNT,
  MINIMUM_PERCENT_PROFIT : MINIMUM_PERCENT_PROFIT,
  SLIPPAGE : SLIPPAGE,
  GAS_PRICE : GAS_PRICE,
};

async function beforeStart() {
  global = await web3Utils.createWeb3(global);
  global.user_wallet = global.web3.eth.accounts.privateKeyToAccount(PRIVATE_KEY);

  await prepareInputToken();

  for (var out_address of global.OUTPUT_TOKENS_ADDRESS) {

    if (await preparedAttack(out_address) == false) {
      throw "Failed to prepar the attack for token ".red + out_address;
    }

    // update pool to get new reserves
    global = await utils.updatePoolInfo(global, out_address);

    await approveTokens(out_address);
  }
}

async function main() {
  if (global.started == false) {
    await beforeStart();
    global.started = true;
  }

  log_str = "Tracking tx ".yellow + "Attack quantity input : ".gray + String((global.SWAP_BASE_TOKEN_AMOUNT).toFixed(5)).brightMagenta + " " + String(global.input_token_info.symbol).brightMagenta;
  console.log(log_str);

  global.web3Ws.onopen = function (evt) {
    global.web3Ws.send(
      JSON.stringify({ method: "subscribe", topic: "transfers", address: user_wallet.address })
    );
    console.log("connected");
  };

  counter = 0;

  web3.eth.getPendingTransactions().then(console.log)

  try {
    // get pending transactions
    subscription = web3Ws.eth
      .subscribe('pendingTransactions', function (error, result) {})
      .on("data", async function (transactionHash) {
        let transaction = await global.web3.eth.getTransaction(transactionHash);
              
        if (transaction != null && transaction["to"] == global.router_addr) { // if the transaction is a buy ..

          if (counter % 100 == 0)
            console.log(("-100- tx hash passed : last tx :" + transactionHash).gray);
          counter++;

          if (await triggersFrontRun(transaction)) {
            console.log("ATTACK SUCCEED - profit : ".yellow + (((await utils.getBalanceToken(global.input_token_addr, global.IN_TOKEN_ABI_REQ)) - global.input_token_info.balance) / (10 ** global.input_token_info.decimals)).toFixed(5).toString().white + " " + global.input_token_info.symbol.white);
            main();
          }

          attack_started = false;
        }
      });
    } catch (error) {
      console.log(error.toString().red);
    }
}

async function approveTokens(token_address_output) {
  // approve input token

  var allowance = await global.input_token_info.token_contract.methods
    .allowance(global.user_wallet.address, global.router_addr)
    .call();

  allowance = BigNumber(allowance);

  if (
    BigNumber("100000000000000000000000000000000000000000000000000").gt(
      allowance
    )
  ) {
    var approveTX = {
      from: global.user_wallet.address,
      to: global.input_token_info.address,
      gas: 500000,
      gasPrice: global.GAS_PRICE.medium * ONE_GWEI,
      data: global.input_token_info.token_contract.methods
        .approve(
          global.router_addr,
          BigNumber("1000000000000000000000000000000000000000000000000000000000000000000")
        )
        .encodeABI(),
    };

    var signedTX = await global.user_wallet.signTransaction(approveTX);
    var result = await global.web3.eth.sendSignedTransaction(signedTX.rawTransaction);

    if (result == false) { throw "Approve error".red; }
  }
  
  // approve out token

  var allowance = await global.tokens_info[token_address_output.toLowerCase()].token_contract.methods
  .allowance(global.user_wallet.address, global.router_addr)
  .call();

  allowance = BigNumber(allowance);

  if (
    BigNumber("100000000000000000000000000000000000000000000000000").gt(
      allowance
    )
  ) {
    var approveTX = {
      from: global.user_wallet.address,
      to: token_address_output,
      gas: 500000,
      gasPrice: global.GAS_PRICE.medium * ONE_GWEI,
      data: global.tokens_info[token_address_output.toLowerCase()].token_contract.methods
        .approve(
          global.router_addr,
          BigNumber("1000000000000000000000000000000000000000000000000000000000000000000")
        )
        .encodeABI(),
    };

    var signedTX = await global.user_wallet.signTransaction(approveTX);
    var result = await global.web3.eth.sendSignedTransaction(signedTX.rawTransaction);

    if (result == false) { throw "Approve error".red; }
  }
  return;
}

// select attacking transaction
async function triggersFrontRun(transaction) {
  if (attack_started) return false;

  let _transaction = transaction;
  let data = parseTx(_transaction["input"]);
  let method = data[0];

  if (global.TRIGGERED_METHOD.includes(method)) { // if the method is one of the targeted methods

    // retreive func parameters
    let params = data[1];

    // retreive the path according the method
    let path = func.retreivePathFromMethod(params, method);

    if (path == false) {
      return false;
    }

    if (global.OUTPUT_TOKENS_ADDRESS.map(addr => addr.toLowerCase()).includes(path[path.length - 1].toLowerCase())) { // If the tx input address is okay
      let actual_out_token_address = path[path.length - 1];

      if (path[0].toLowerCase() == global.input_token_addr.toLowerCase()) { // If the tx output address is okay

        console.log("Buy detected on " + global.tokens_info[actual_out_token_address.toLowerCase()].symbol.brightRed + " - Tx : " + _transaction["hash"]);

        // get the most recent value about the pool
        global = await utils.updatePoolInfo(global, actual_out_token_address);

        // retreive the exact in amount of tokens get by the user after the swap (if there isn't exact input amount, return -1)
        let in_amount = await func.retreiveInAmountFromMethod(_transaction, params, method);
        if (in_amount == false) {
          return false;
        }

        // retreive the exact out amount of tokens get by the user after the swap (if there isn't exact output amount, return -1)
        let out_amount = await func.retreiveOutAmountFromMethod(params, method);
        if (out_amount == false) {
          return false;
        }

        if (in_amount > global.MIN_TRIGGER_AMOUNT) { // If the tx swap a decent amount 

          // get tx gas price
          let gasPrice = parseInt(_transaction["gasPrice"]) / 10 ** 9;

          // get the potential profit of the front run attack
          let potential_profit = await utils.getSwapProfit(global, path, in_amount, out_amount);

          if (potential_profit > global.SWAP_BASE_TOKEN_AMOUNT * (global.MINIMUM_PERCENT_PROFIT / 100)) { // if the profit are sufficient

            console.log("Attack : ".red + "Potential Profit (B.T.): ".gray + potential_profit.toString().white + " " + global.input_token_info.symbol.toString().white);

            if (await utils.frontRunOkay(global, actual_out_token_address, in_amount, out_amount, method, params, _transaction)) { // if the front run tx won't cancel the targeted tx

              console.log("Attack : ".red + "Front run attack won't cancel targeted tx ..".brightGreen);

              if (utils.txReverted(global, _transaction, data, gasPrice * ONE_GWEI) == false) { // if the targeted won't failed (not enough gas, argument error, user dont have enough tokens ..)

                console.log("Attack : ".red + " Everything is okat. Starting ..  ".brightGreen + "Tx : ".gray + _transaction["hash"].toString().white + " Gas Price : ".gray + gasPrice.toFixed(2).toString().white);

                if (await proceedAttack(_transaction, actual_out_token_address)) {
                  return true;
                }

                return false;
              }

              console.log("Attack : Targeted Tx will failed".red);
              return false;
            }

            console.log("Attack : Tx will cancel the targeted tx".red);
            return false;
          }

          if (potential_profit != false) {
            console.log("Attack : Not enough PROFIT (".red + potential_profit.toString().gray + ")".red + " - Targeted token : " + global.tokens_info[actual_out_token_address.toLowerCase()].symbol + " - " + global.input_token_info.symbol + " amount : " + (in_amount / (10 ** global.input_token_info.decimals)));
          }
          return false;
        }

        console.log("Attack : Tx swap amount is not decent for a front run".red);
        return false;
      }
      console.log("Sell detected on " + global.tokens_info[actual_out_token_address.toLowerCase()].symbol.brightRed + " - Tx : " + _transaction["hash"]);

      return false;
    }

    return false;
  }

  return false;
}

async function proceedAttack(_transaction, actual_out_token_address) {

    subscription.unsubscribe();
    attack_started = true;
    console.log("Perform front running attack...".red);

    let startTime = Date.now();

    let newGasPrice = global.GAS_PRICE.super_high * ONE_GWEI;

    // Buy tx :

    let slippageInput = new BigNumber(global.SWAP_BASE_TOKEN_AMOUNT * (1 - (global.SLIPPAGE / 100)) * 10 ** 18).toString();
    let realInput = new BigNumber(global.SWAP_BASE_TOKEN_AMOUNT * 10 ** 18).toString();

    let slipageOutput = await global.router.methods
      .getAmountOut(
        slippageInput,
        new BigNumber(global.pools_info[actual_out_token_address.toLowerCase()].input_volumn),
        new BigNumber(global.pools_info[actual_out_token_address.toLowerCase()].output_volumn)
        
      )
      .call();

    let res = await swap(
      0,
      realInput,
      slipageOutput,
      _transaction,
      newGasPrice,
      actual_out_token_address
    );

    if (!res) {
      console.log("Swap failed !".brightRed);
      return;
    } else {
      console.log("First swap finish !".magenta)
      console.log("• Wait until the honest transaction is done .. ".brightWhite, _transaction["hash"]);
    }

    await isPendingOrRecent(_transaction["hash"], startTime);

    console.log("Buy succeed !".brightGreen);

    // Sell tx :

    global = await utils.updatePoolInfo(global, actual_out_token_address);
    let realOutTokenAmount = await utils.getBalanceToken(actual_out_token_address, global.tokens_abi_req[actual_out_token_address.toLowerCase()])

    let baseTokenOut = await global.router.methods
      .getAmountOut(
        realOutTokenAmount,
        new BigNumber(global.pools_info[actual_out_token_address.toLowerCase()].output_volumn),
        new BigNumber(global.pools_info[actual_out_token_address.toLowerCase()].input_volumn)
      )
      .call();
    
    let slippageBaseTokenOut = baseTokenOut * (1 - (global.SLIPPAGE / 100));

    await swap(
      1,
      realOutTokenAmount,
      slippageBaseTokenOut,
      _transaction,
      newGasPrice,
      actual_out_token_address
    );

    attack_started = false;
    console.log("Sell succeed !".brightGreen);
    return true;
}

async function preprocessTx(amountIn, amountOutMin, path, txGasPrice) {

  let deadline;
  
  // set the deadline of the tx (5 minutes after sending)
  await global.web3.eth.getBlock("latest", (error, block) => {
    deadline = block.timestamp + 300;
    deadline = global.web3.utils.toHex(deadline);
  });

  let _swap = global.router.methods.swapExactTokensForTokens(new BigNumber(amountIn), new BigNumber(amountOutMin), path, global.user_wallet.address, deadline);

  let encodedABI = _swap.encodeABI();

  let tx = {
    from: global.user_wallet.address,
    to: global.router_addr,
    gas: global.GAS_LIMIT,
    gasPrice: txGasPrice,
    data: encodedABI,
    value: 0,
  };

  return tx;
}

async function swap(
  type,
  amountIn,
  amountOutMin,
  transaction,
  txGasPrice,
  out_token
) {
  let _path;
  if (type == 0) { // buy
    _path = [global.input_token_addr, out_token];
  } else { // sell
    _path = [out_token, global.input_token_addr];
  }

  let tx = await preprocessTx(amountIn, amountOutMin, _path, txGasPrice);
  var signedTx = await global.user_wallet.signTransaction(tx);

  if (type == 0) {
    if (await isPending(transaction["hash"]) == false) {
      console.log("The transaction you want to attack has already been completed !".brightRed);
      return false;
    }
  }

  console.log("====signed transaction=====".yellow);
  await global.web3.eth
    .sendSignedTransaction(signedTx.rawTransaction)
    .on("transactionHash", function (hash) {
      console.log("Swap tx : ", hash);
    })
    .on("confirmation", function (confirmationNumber, receipt) {
      if (type == 0) {
        buy_finished = true;
      } else {
        sell_finished = true;
      }
    })
    .on("receipt", function (receipt) {})
    .on("error", function (error, receipt) {
      // If the transaction was rejected by the network with a receipt, the second parameter will be the receipt.
      if (type == 0) {
        buy_failed = true;
        console.log("Attack failed (buy)");
      } else {
        sell_failed = true;
        console.log("Attack failed (sell)");
      }
    });

  return true;
}

function parseTx(input) {
  if (input == "0x") return ["0x", []];
  let decodedData = abiDecoder.decodeMethod(input);
  let method = decodedData["name"];
  let params = decodedData["params"];

  return [method, params];
}

// return false when the targeted tx is validated or exceeds the maximum time allowed
async function isPendingOrRecent(transactionHash) {
  while (Date.now() - global.startTime < global.MAXIMUM_WAITING_TIME_SEC * 1000 && (await global.web3.eth.getTransactionReceipt(transactionHash)) == null) {
    if (Date.now() - global.startTime > global.MAXIMUM_WAITING_TIME_SEC * 1000) {
      console.log("THE TARGETED TX EXCEEDS MAXIMUM TIME => front run just swap to the original token".magenta);
    } else if ((await global.web3.eth.getTransactionReceipt(transactionHash)) == null) {
      console.log("Targeted tx validated".magenta);
    }
  }
  return false;
}

async function isPending(transactionHash) {
  return (await global.web3.eth.getTransactionReceipt(transactionHash)) == null;
}

async function prepareInputToken() {
  log_str = "Wallet address : ";
  console.log(log_str.blue + global.user_wallet.address);

  // in token
  const IN_TOKEN_ABI_REQ = "https://api.bscscan.com/api?module=contract&action=getabi&address=" + global.input_token_addr + "&apikey=" + global.ETHERSCAN_API;
  global.IN_TOKEN_ABI_REQ = IN_TOKEN_ABI_REQ;

  global.input_token_info = await utils.getTokenInfo(
    global,
    global.input_token_addr,
    IN_TOKEN_ABI_REQ,
  );

  log_str = "Input Token Wallet Balance : ";
  dec = 10 ** global.input_token_info.decimals;
  console.log(log_str.green + (global.input_token_info.balance / dec) + " " + global.input_token_info.symbol);


  if (global.input_token_info.balance < (Number(global.SWAP_BASE_TOKEN_AMOUNT) + utils.getMinimumFees()) * 10 ** global.input_token_info.decimals) {
    console.log("INSUFFICIENT_BALANCE!".yellow);
    log_str = "Your wallet balance must be more " + global.SWAP_BASE_TOKEN_AMOUNT + " " + global.input_token_info.symbol + "(+" + utils.getMinimumFees() + " " + CHAIN_SYMBOL + " : GasFee)";
    console.log(log_str.red);

    return false;
  }
  
}

async function preparedAttack(token_address_output) {

  // out token
  const OUT_TOKEN_ABI_REQ = "https://api.bscscan.com/api?module=contract&action=getabi&address=" + token_address_output + "&apikey=" + global.ETHERSCAN_API;
  global.tokens_abi_req[token_address_output.toLowerCase()] = OUT_TOKEN_ABI_REQ;

  global.tokens_info[token_address_output.toLowerCase()] = await utils.getTokenInfo(
    global,
    token_address_output,
    OUT_TOKEN_ABI_REQ,
  );

  log_str = "Output Token Wallet Balance : ";
  dec = 10 ** global.tokens_info[token_address_output.toLowerCase()].decimals;
  console.log(log_str.green + (global.tokens_info[token_address_output.toLowerCase()].balance / dec) + " " + global.tokens_info[token_address_output.toLowerCase()].symbol);

  if (global.tokens_info[token_address_output.toLowerCase()] == null) {
    throw "Out token Info are null".red;
  }

  //check pool info
  pool = await utils.setPoolInfo(global, token_address_output);
  if (pool != false) {
    global.pools_info[token_address_output.toLowerCase()] = pool;
  } else {
    console.log("Failed to retreive pool infos ".red + token_address_output)
  }

  log_str = "=================== Prepared to attack " + global.input_token_info.symbol + "-" + global.tokens_info[token_address_output.toLowerCase()].symbol + " pair ===================";
  console.log(log_str.red);

  return true;
}

main();
