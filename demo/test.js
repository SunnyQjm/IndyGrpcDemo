const IndyNode = require('../indy/IndyNode');
const IndyTrancClient = require('../rpc/indy_trans_client');

async function main() {
    let indyNode = new IndyNode('Test');
    await indyNode.easyCreateTestPoolConfigAndOpenIt('poo1')
        .then(res => {
            return indyNode.createWalletIfNotExistsAndThenOpenIT({
                'id': 'testWallet',
            }, {
                'key': 'test_key'
            })
        })
        .then(res => {
            return indyNode.createAndStoreDidRandom();
        })
        .then(res => {
            let [did, verkey] = res;
            return indyNode.getSchema('SZGHjdndg8DvxETxNbhksf:2:Transcript:1.2', did);
        })
        .then(res => {
            console.log(res);
            return indyNode.closeAndDeleteWallet();
        })
        .then(res => {
            console.log('成功删除钱包');
        })
        .catch(err => {
            console.log(err);
        });
}

main();