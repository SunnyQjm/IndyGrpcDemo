const IndyNode = require('../indy/IndyNode');
const IndyTransClient = require('../rpc/indy_trans_client');

async function main() {
    let indyNode = new IndyNode('Faber');
    await indyNode.easyCreateTestPoolConfigAndOpenIt('poo1')
        .then(res => {
            return indyNode.createWalletIfNotExistsAndThenOpenIT({
                'id': 'faberWalletName',
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
    let indyTransClient = new IndyTransClient('localhost', '9748', indyNode);

    let call;
    let myDid, myVerkey, targetDid, targetVerkey;
    //Faber 首先连接到Steward节点，然后获取到 TrustAnchor 身份
    await indyTransClient.doOnBoarding()
        .then(res => {
            [call, myDid, myVerkey, targetDid, targetVerkey] = res.call;
            // onboarding 成功之后接着申请 TrustAnchor 身份
            return indyTransClient.getVerinymDid(res.call, 'TRUST_ANCHOR', myVerkey, targetVerkey);
        })
        .then(mydid => {
            call.end();
            console.log('申请成功： ' + mydid);
        });
}

main();