const IndyNode = require('../indy/IndyNode');
const IndyTransClient = require('../rpc/indy_trans_client');

async function main() {
    let indyNode = new IndyNode('Government');
    await indyNode.easyCreateTestPoolConfigAndOpenIt('poo1')
        .then(res => {
            return indyNode.createWalletIfNotExistsAndThenOpenIT({
                'id': 'governmentWalletName',
            }, {
                'key': 'government_key'
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
            [call, myDid, myVerkey, targetDid, targetVerkey] = res;
            // onboarding 成功之后接着申请 TrustAnchor 身份
            return indyTransClient.getVerinymDid(call, 'TRUST_ANCHOR', myVerkey, targetVerkey);
        })
        .then(mydid => {        //申请成为 TRUST_ANCHOR 成功
            //更新当前节点的 Verinym Key
            indyNode.updateCurrentVerinymDid(mydid);

            //政府创建成绩证明模式
            return indyNode.issuerCreateSchema('Transcript', '1.2',
                ['first_name', 'last_name', 'degree', 'status',
                    'year', 'average', 'ssn'])
        })
        .then(res => {
            let [transcriptSchemaId, transcriptSchema] = res;
            console.log('成功创建成绩模式定义: ' + transcriptSchemaId);
            return indyNode.sendSchema(transcriptSchema);
        })
        .then(res => {
            call.end();
        });
}

main();