const IndyNode = require('../indy/IndyNode');
const IndyTransClient = require('../rpc/indy_trans_client');
const IndyTransServer = require('../rpc/indy_trans_server');

const SchemaId = 'SZGHjdndg8DvxETxNbhksf:2:Transcript:1.2';
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
            [call, myDid, myVerkey, targetDid, targetVerkey] = res;
            // onboarding 成功之后接着申请 TrustAnchor 身份
            return indyTransClient.getVerinymDid(call, 'TRUST_ANCHOR', myVerkey, targetVerkey);
        })
        .then(mydid => {
            console.log('申请成功： ' + mydid);
            indyNode.updateCurrentVerinymDid(mydid);
            return indyNode.getSchema(SchemaId, mydid)
        })
        .then(res => {
            let [, transcriptSchema] =  res;
            return indyNode.issuerCreateAndStoreCredentialDef(transcriptSchema,
                'TAG1', 'CL', '{"support_revocation": false}');
        })
        .then(res => {
            let [faberTranscriptCredDefId, faberTranscriptCredDefJson] = res;
            console.log('成功创建成绩证书定义: ' + faberTranscriptCredDefId);
            //将证书定义写到账本里
            return indyNode.sendCredDef(faberTranscriptCredDefJson);
        })
        .then(res => {
           call.end();
        });
    let indyTransServer = new IndyTransServer('0.0.0.0', '9749', indyNode);
    indyTransServer.start();
}

main();