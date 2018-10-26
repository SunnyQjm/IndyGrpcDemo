const IndyNode = require('../indy/IndyNode');
const IndyTrancClient = require('../rpc/indy_trans_client');

async function main() {
    let indyNode = new IndyNode('Alice');
    await indyNode.easyCreateTestPoolConfigAndOpenIt('poo1')
        .then(res => {
            return indyNode.createWalletIfNotExistsAndThenOpenIT({
                'id': 'aliceWalletName',
            }, {
                'key': 'alice_key'
            })
        })
        .then(res => {
            console.log(res);
        })
        .catch(err => {
            console.log(err);
        });
    let indyTransClient = new IndyTrancClient('localhost', '9749', indyNode);
    let call;
    let myDid, myVerkey, targetDid, targetVerkey;
    indyTransClient.doOnBoarding()
        .then(res => {
            [call, myDid, myVerkey, targetDid, targetVerkey] = res;
            return indyTransClient.getCredential(call, myDid, myVerkey, targetVerkey, '8viGv9CAbmdSLotjmEZmrf:3:CL:191:TAG1')
        })
        .then(res => {
            console.log(res);
        });
}

main();