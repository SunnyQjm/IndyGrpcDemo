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
    let indyTransClient = new IndyTrancClient('localhost', '9748', indyNode);
    indyTransClient.doOnBoarding()
        .then(res => {
            console.log(JSON.stringify(res));
        });
}

main();