const IndyNode = require('../indy/IndyNode');
const IndyTransServer = require('../rpc/indy_trans_server');

async function main() {
    let indyNode = new IndyNode('Steward');

    await indyNode.easyCreateTestPoolConfigAndOpenIt('pool1')
        .then(res => {
            return indyNode.createWalletIfNotExistsAndThenOpenIT({
                'id': 'stewardWalletName',
            }, {
                'key': 'steward_key'
            })
        })
        .then(res => {
           return indyNode.createAndStoreDidBySeed('000000000000000000000000Steward1');
        })
        .then(res => {
            let [stewardDid, stewardKey] = res;
            console.log(res);
            indyNode.updateCurrentVerinymDid(stewardDid);
            return Promise.resolve(1);
        })
        .catch(err => {
            console.log(err);
        });
    // console.log(IndyTransServer);
    let indyTransServer = new IndyTransServer('0.0.0.0', 9748, indyNode);
    indyTransServer.start();
}

main();