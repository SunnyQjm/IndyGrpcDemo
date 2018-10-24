const IndyNode = require('../indy/IndyNode');
const IndyTrancClient = require('../rpc/indy_trans_client');

async function main() {
    let indyNode = new IndyNode('Faber');
    await indyNode.easyCreateTestPoolConfigAndOpenIt('poo1')
        .then(res => {
            return indyNode.createWalletIfNotExistsAndThenOpenIT({
                'id': 'FaberWalletName',
            }, {
                'key': 'faber_key'
            })
        })
        .then(res => {
            console.log(res);
        })
        .catch(err => {
            console.log(err);
        });
    let indyTransClient = new IndyTrancClient('localhost', '9748', indyNode);

    //Faber 首先连接到Steward节点，然后获取到 TrustAnchor 身份
    await indyTransClient.doOnBoarding()
        .then(res => {
            console.log(JSON.stringify(res));
        });
}

main();