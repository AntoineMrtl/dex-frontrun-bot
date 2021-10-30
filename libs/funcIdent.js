// this library is used to define all functions that are related to the separation and processing of the differents functions of a router

const retreivePathFromMethod = function(params, method) {
    if (["swapExactETHForTokens", "swapETHForExactTokens"].includes(method)) { // if the method only have 4 arguments
        return params[1].value;
    }
    else if (["swapExactTokensForTokens", "swapExactTokensForETH","swapTokensForExactTokens", "swapTokensForExactETH"].includes(method)) {
        return params[2].value;
    }

    console.log("retreivePathFromMethod : Unable to identify the path from the given method : ".red + method.toString().gray);
    return false
}

const retreiveInAmountFromMethod = async function(transaction, params, method) {

    if (["swapExactTokensForTokens", "swapExactTokensForETH", "swapExactTokensForTokensSupportingFeeOnTransferTokens", "swapExactTokensForETHSupportingFeeOnTransferTokens"].includes(method)) { // if "method" is one of this methods names ..
        // return exact input amount (this amount is certain)
        return params[0].value;
    }
    else if (["swapExactETHForTokens", "swapExactETHForTokensSupportingFeeOnTransferTokens"].includes(method)) {
        // return exact input amount (this amount is certain)
        return transaction.value; // return msg.value of the tx (because the swap is executed with blochain's native token)
    }
    else if (["swapTokensForExactTokens", "swapTokensForExactETH", "swapETHForExactTokens"].includes(method)) {
        // no exact input amount in parameters, return -1
        return -1;
    } 
    else {
        console.log("retreiveInAmountFromMethod : Unable to identify in amount from the given method : ".red + method.toString().gray);
        return false
    }
}

const retreiveOutAmountFromMethod = async function(params, method) {

    if (["swapTokensForExactTokens", "swapTokensForExactETH", "swapETHForExactTokens"].includes(method)) {
        // return exact output amount (this amount is certain)
        return params[0].value;
    } 
    else if (["swapExactTokensForTokens", "swapExactTokensForETH", "swapExactTokensForTokensSupportingFeeOnTransferTokens", "swapExactTokensForETHSupportingFeeOnTransferTokens", "swapExactETHForTokens", "swapExactETHForTokensSupportingFeeOnTransferTokens"].includes(method)) { // if "method" is one of this methods names ..
        // no exact output amount in parameters, return -1
        return -1; 
    }
    else {
        console.log("retreiveOutAmountFromMethod : Unable to identify out amount from the given method : ".red + method.toString().gray);
        return false
    }
}

module.exports = {
    retreiveInAmountFromMethod,
    retreiveOutAmountFromMethod,
    retreivePathFromMethod
};