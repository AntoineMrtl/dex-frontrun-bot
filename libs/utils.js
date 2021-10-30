var axios = require("axios");
const BigNumber = require('bignumber.js');

// get token info from tokenAddr
const getTokenInfo = async function(global, tokenAddr, token_abi_ask) {

    //get token abi
    response = await axios.get(token_abi_ask);
    if (response.data.status == 0) {
        throw "Invalid Token Address !".red;
    }
  
    token_abi = response.data.result;
  
    //get token info
    token_contract = new global.web3.eth.Contract(
        JSON.parse(token_abi),
        tokenAddr
    );
        
    balance = await token_contract.methods.balanceOf(global.user_wallet.address).call();
    decimals = await token_contract.methods.decimals().call();
    symbol = await token_contract.methods.symbol().call();

    return {
        address: tokenAddr,
        balance: balance,
        symbol: symbol,
        decimals: decimals,
        abi: token_abi,
        token_contract: token_contract,
    };
}

// set the pool info (in pools_info) from input token and output token
const setPoolInfo = async function(global, out_token_address) {
    input_token_address = global.input_token_info.address;

    log_str = "\t" + global.input_token_info.symbol + "-" + global.tokens_info[out_token_address.toLowerCase()].symbol + " Pair Pool Info\t";
    console.log(log_str.gray);

    pool_address = await global.factory.methods
        .getPair(input_token_address, out_token_address)
        .call();
    if (pool_address == "0x0000000000000000000000000000000000000000") {
        log_str = "PanCake has no " + global.tokens_info[out_token_address.toLowerCase()].symbol + "-" + global.input_token_info.symbol + " pair";
        console.log(log_str.yellow);
        return false;
    }
  
    log_str = "Address :\t" + pool_address;
    console.log(log_str.gray);

    pool_contract = new global.web3.eth.Contract(global.pool_abi, pool_address);
    reserves = await pool_contract.methods.getReserves().call();
      
    token0_address = await pool_contract.methods.token0().call();

    if (token0_address == global.input_token_addr) {
        var forward = true;
        var baseToken = reserves[0];
        var SwappedToken = reserves[1];
    } else {
        var forward = false;
        var baseToken = reserves[1];
        var SwappedToken = reserves[0];
    }
  
    log_str = "Reserve base token    : " + (baseToken / 10 ** global.input_token_info.decimals).toFixed(5) + "\t" + global.input_token_info.symbol + "(" + global.input_token_info.decimals + ")";
    console.log(log_str.gray);
  
    log_str = "Reserve swapped token : " + (SwappedToken / 10 ** global.tokens_info[out_token_address.toLowerCase()].decimals).toFixed(5) + "\t" + global.tokens_info[out_token_address.toLowerCase()].symbol + "(" + global.tokens_info[out_token_address.toLowerCase()].decimals + ")";
    console.log(log_str.gray);
      
    // add all the data to the global namespace
    return {
        contract: pool_contract,
        input_volumn: baseToken,
        forward : forward,
        output_volumn: SwappedToken,
    };
}

const updatePoolInfo = async function(global, out_token_address) {
    reserves = await global.pools_info[out_token_address.toLowerCase()].contract.methods.getReserves().call();
  
    if (global.pools_info[out_token_address.toLowerCase()].forward) {
        var base_token_balance = reserves[0];
        var out_token_balance = reserves[1];
    } else {
        var base_token_balance = reserves[1];
        var out_token_balance = reserves[0];
    }

    global.pools_info[out_token_address.toLowerCase()].input_volumn = base_token_balance;
    global.pools_info[out_token_address.toLowerCase()].output_volumn = out_token_balance;
    return global;
}

const getReserves = async function(global, token1, token2) {
    pool_address = await global.factory.methods
        .getPair(token1, token2)
        .call();
    pool_contract = new global.web3.eth.Contract(global.pool_abi, pool_address);

    reserves = await pool_contract.methods.getReserves().call();
    token0_address = await pool_contract.methods.token0().call();

    if (token1 == token0_address) {
        return [reserves[0], reserves[1]];
    } else {
        return [reserves[1], reserves[0]];
    }
}

const getSwapProfit = async function(global, path, in_amount, out_amount) {

    let dec = 10 ** parseFloat(global.input_token_info.decimals);

    // get the number of token of the front runner at the end of the first swap
    token1_amount = await global.router.methods
    .getAmountsOut(
        new BigNumber(global.SWAP_BASE_TOKEN_AMOUNT * dec),
        [global.input_token_addr, path[path.length - 1]]
    )
    .call();
    token1_amount = token1_amount[token1_amount.length - 1]

    if (out_amount == -1) { // if out_amount = -1 (=> there isn't any exact out_amount in the params), retreive the out_amount from in_amount
        if (in_amount == -1) {
            console.log("getSwapProfit : out_amount and in_amount undefined".red);
            return false;
        }
        
        let n = 0;
        in_amount_token = in_amount;
        out_amount_token = 0;

        for (let _token of path) {
            
            compute_out = false;

            if (n == path.length - 1) { // for the last token ..
                if (path[n - 1].toLowerCase() == global.input_token_addr.toLowerCase()) { 
                    input_volumn = parseInt(global.pools_info[_token.toLowerCase()].input_volumn) + parseInt((global.SWAP_BASE_TOKEN_AMOUNT * dec)); // add the base token gave to receive targeted token (by the bot)
                    output_volumn = parseInt(global.pools_info[_token.toLowerCase()].output_volumn) - parseInt(token1_amount); // remove from the pool the targeted tokens received (by the bot)

                    compute_out = true;
                } else {
                    console.log("getSwapProfit : second last token of the swap is not ".red + global.input_token_info.symbol.toString().red);
                    return false;
                }
            } 
            else if (n < path.length - 2) { // (< path.length -2) => just take all the token except the last and the second last
                let reserves = await getReserves(global, path[n], path[n + 1])

                input_volumn = reserves[0];
                output_volumn = reserves[1];

                compute_out = true;
            }
            if (compute_out == true) {
                // get the number of token received by the target tx after the first swap
                out_amount_token = await global.router.methods
                .getAmountOut(
                    new BigNumber(in_amount_token),
                    new BigNumber(input_volumn),
                    new BigNumber(output_volumn)
                )
                .call();
                in_amount_token = out_amount_token;
            }

            n++;
        }

        out_amount = out_amount_token;
    } else if (in_amount == -1) {
        let _token = path[path.length - 1].toLowerCase()

        if (out_amount == -1) {
            console.log("getSwapProfit : out_amount and in_amount undefined".red);
            return false;
        }
        if (path[path.length - 2].toLowerCase() != global.input_token_addr.toLowerCase()) { // for the last token ..
            console.log("getSwapProfit : second last token of the swap is not ".red + global.input_token_info.symbol.toString().red);
            return false;
        }

        in_amount = await global.router.methods
        .getAmountIn(
            new BigNumber(out_amount),
            new BigNumber(global.pools_info[_token].input_volumn + (global.SWAP_BASE_TOKEN_AMOUNT * dec)),
            new BigNumber(global.pools_info[_token].output_volumn - token1_amount)
        )
    }
    let out_token = path[path.length - 1].toLowerCase()

    // get number of token0 of front runner at the end of the 3 swap
    input_final_token = await global.router.methods
    .getAmountOut(
        new BigNumber(token1_amount),
        new BigNumber(parseFloat(global.pools_info[out_token.toLowerCase()].output_volumn) - parseFloat(out_amount) - parseFloat(token1_amount)), // the new output amount (targeted token pool amount) no longer has the tokens swapped from the 2 tx (front run and targeted tx)
        new BigNumber(parseFloat(global.pools_info[out_token.toLowerCase()].input_volumn) + parseFloat(global.SWAP_BASE_TOKEN_AMOUNT * dec) + parseFloat(in_amount)), // the new reserve[0] has all the tokens swapped from tx (token0)
    )
    .call();

    // compute total profit (in base token)
    profit = ((parseFloat(input_final_token) - (parseFloat(global.SWAP_BASE_TOKEN_AMOUNT) * dec)) / dec);
    // remove from the profit the exchange fees
    profit -= ((global.EXCHANGE_PERCENT_FEES * 2) / 100) * global.SWAP_BASE_TOKEN_AMOUNT;
    
    return profit;
}

const getBalanceToken = async function(token_addr, token_abi_ask) {
    //get token abi
    response = await axios.get(token_abi_ask);
    if (response.data.status == 0) {
        throw "Invalid Token Address !".red;
    }
      
    token_abi = response.data.result;
      
    //get token info
    token_contract = new global.web3.eth.Contract(
        JSON.parse(token_abi),
        token_addr
    );

    balance = await token_contract.methods.balanceOf(global.user_wallet.address).call();
    return balance;
}

const frontRunOkay = async function(global, out_token_address, tx_in_amount, tx_out_amount, method, params, transaction) {

    let dec = 10 ** parseFloat(global.input_token_info.decimals);

    // get the number of token of the front runner at the end of the first swap
    token1_out = await global.router.methods
    .getAmountsOut(
        new BigNumber(global.SWAP_BASE_TOKEN_AMOUNT * dec),
        [global.input_token_addr, out_token_address]
    )
    .call();
    token1_out = token1_out[token1_out.length - 1]

    if (tx_in_amount != -1) { // if there is an amountOutMin parameter in the method

        let amountOutMin;
        if (method == "swapExactETHForTokens") {
            amountOutMin = params[0].value
        } else {
            amountOutMin = params[1].value
        }

        // get the new out amount after the 1st attack swap
        out_amount = await global.router.methods
        .getAmountOut(
            new BigNumber(tx_in_amount),
            new BigNumber(parseInt(global.pools_info[out_token_address.toLowerCase()].input_volumn) + (parseInt(global.SWAP_BASE_TOKEN_AMOUNT) * dec)),
            new BigNumber(parseInt(global.pools_info[out_token_address.toLowerCase()].output_volumn) - parseInt(token1_out))
        )
        .call();

        console.log("in amount : " + tx_in_amount)
        console.log("input volumn : " + parseInt(global.pools_info[out_token_address.toLowerCase()].input_volumn) + (parseInt(global.SWAP_BASE_TOKEN_AMOUNT) * dec))
        console.log("output volumn : " + parseInt(global.pools_info[out_token_address.toLowerCase()].output_volumn) - parseInt(token1_out))

        console.log("Tx out min amount : " + amountOutMin);
        console.log("Predicted new out amount of the tx : " + out_amount);

        // if the new out amount is less than the minimum out amount required, return false
        if (out_amount < amountOutMin) {
            return false;
        } else {
            return true;
        }
    }

    else if (tx_out_amount != 1) { // if there is an amountInMax parameter in the method

        let amountInMax;
        if (method == "swapETHForExactTokens") {
            amountInMax = transaction.value;
        } else {
            amountInMax = params[1].value;
        }

        // get the new out amount after the 1st attack swap
        in_amount = await global.router.methods
        .getAmountIn(
            new BigNumber(tx_out_amount),
            new BigNumber(parseInt(global.pools_info[out_token_address.toLowerCase()].input_volumn) + (parseInt(global.SWAP_BASE_TOKEN_AMOUNT) * dec)),
            new BigNumber(parseInt(global.pools_info[out_token_address.toLowerCase()].output_volumn) - parseInt(token1_out))
        )
        .call();

        console.log("out amount : " + tx_out_amount)
        console.log("input volumn : " + parseInt(global.pools_info[out_token_address.toLowerCase()].input_volumn) + (parseInt(global.SWAP_BASE_TOKEN_AMOUNT) * dec))
        console.log("output volumn : " + parseInt(global.pools_info[out_token_address.toLowerCase()].output_volumn) - parseInt(token1_out))

        console.log("Tx in max amount : " + amountInMax);
        console.log("Predicted new in amount of the tx : " + in_amount);

        // if the new in amount required to do the swap is more than the maximum in amount, return false
        if (in_amount > amountInMax) {
            return false;
        } else {
            return true;
        }
    }

    console.log("frontRunOkay : Error".red)
    return false;
}

const txReverted = function(global, transaction, data) {
    // return true if the targeted tx will failed

    tx_method = data[0];
    tx_params = data[1];
    value = 0;

    if (tx_method == "swapTokensForExactTokens") {
        ref = global.router.methods.swapTokensForExactTokens(tx_params[0].value.toString(), tx_params[1].value.toString(), [tx_params[2].value[0].toString(), tx_params[2].value[1].toString()], tx_params[3].value.toString(), tx_params[4].value.toString());
    } else if (tx_method == "swapTokensForExactETH") {
        ref = global.router.methods.swapExactTokensForTokens(tx_params[0].value.toString(), tx_params[1].value.toString(), [tx_params[2].value[0].toString(), tx_params[2].value[1].toString()], tx_params[3].value.toString(), tx_params[4].value.toString());
    } else if (tx_method == "swapExactTokensForTokens") {
        ref = global.router.methods.swapExactTokensForTokens(tx_params[0].value.toString(), tx_params[1].value.toString(), [tx_params[2].value[0].toString(), tx_params[2].value[1].toString()], tx_params[3].value.toString(), tx_params[4].value.toString());
    } else if (tx_method == "swapExactTokensForETH") {
        ref = global.router.methods.swapExactTokensForETH(tx_params[0].value.toString(), tx_params[1].value.toString(), [tx_params[2].value[0].toString(), tx_params[2].value[1].toString()], tx_params[3].value.toString(), tx_params[4].value.toString());
    } else if (tx_method == "swapExactETHForTokens") {
        console.log(tx_params[0].value.toString(), tx_params[1].value.toString(), [tx_params[2].value[0].toString(), tx_params[2].value[1].toString()], tx_params[3].value.toString())
        ref = global.router.methods.swapExactETHForTokens(tx_params[0].value.toString(), [tx_params[1].value[0].toString(), tx_params[1].value[1].toString()], tx_params[2].value.toString(), tx_params[3].value.toString());
        value = transaction.value;
    } else if (tx_method == "swapETHForExactTokens") {
        ref = global.router.methods.swapETHForExactTokens(tx_params[0].value.toString(), [tx_params[1].value[0].toString(), tx_params[1].value[1].toString()], tx_params[2].value.toString(), tx_params[3].value.toString());
        value = transaction.value;
    } else {
        console.log("txReverted : Unknown method");
        return false;
    }

    txRevert = false;

    ref.estimateGas(
        {
            from: transaction.from,
            value: value,
            gasPrice: global.GAS_PRICE.medium * 1e9 
        }, function(error, estimatedGas) {
            if (error == null) {
                if (transaction.gas >= estimatedGas) {
                        txRevert = false;
                } else {
                    console.log(transaction.gas, estimatedGas)
                    txRevert = true;
                }
            } else {
                console.log(error)
                txRevert = true; 
            }
        }
    )

    return txRevert;
}

const getMinimumFees = function() {
    return 0.05;
}

module.exports = {
    getTokenInfo,
    setPoolInfo,
    updatePoolInfo,
    getBalanceToken,
    getReserves,
    getMinimumFees,
    getSwapProfit,
    frontRunOkay,
    txReverted
};
