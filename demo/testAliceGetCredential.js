const IndyNode = require('../indy/IndyNode');
const IndyTransServer = require('../rpc/indy_trans_server');
const IndyTransClient = require('../rpc/indy_trans_client');

async function steward() {
    let indyNode = new IndyNode('Steward');

    await indyNode.easyCreateTestPoolConfigAndOpenIt('pool')
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
    let indyTransServer = new IndyTransServer('0.0.0.0', 9748, indyNode);
    indyTransServer.start();
}

async function government() {
    let indyNode = new IndyNode('Government');
    await indyNode.easyCreateTestPoolConfigAndOpenIt('pool1')
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
    let gTranscriptSchemaId;
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
            console.log(transcriptSchema);
            gTranscriptSchemaId = transcriptSchemaId;
            return indyNode.sendSchema(transcriptSchema);
        })
        .then(res => {
            call.end();
        });
    return gTranscriptSchemaId;
}

async function faber(schemaId) {
    let indyNode = new IndyNode('Faber');
    await indyNode.easyCreateTestPoolConfigAndOpenIt('pool2')
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
            console.error(err);
            process.exit(-1);
        });
    let indyTransClient = new IndyTransClient('localhost', '9748', indyNode);

    let call;
    let myDid, myVerkey, targetDid, targetVerkey;
    let credDefId;
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
            return indyNode.getSchema(schemaId, mydid)
        })
        .then(res => {
            let [, transcriptSchema] =  res;
            return indyNode.issuerCreateAndStoreCredentialDef(transcriptSchema,
                'TAG1', 'CL', '{"support_revocation": false}');
        })
        .then(res => {
            let [faberTranscriptCredDefId, faberTranscriptCredDefJson] = res;
            console.log('成功创建成绩证书定义: ' + faberTranscriptCredDefId);
            credDefId = faberTranscriptCredDefId;
            //将证书定义写到账本里
            return indyNode.sendCredDef(faberTranscriptCredDefJson);
        })
        .then(res => {
            call.end();
        });
    let indyTransServer = new IndyTransServer('0.0.0.0', '9749', indyNode);
    indyTransServer.start();
    return credDefId;
}

async function alice(credDefId) {
    let indyNode = new IndyNode('Alice');
    await indyNode.easyCreateTestPoolConfigAndOpenIt('pool3')
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
    let indyTransClient = new IndyTransClient('localhost', '9749', indyNode);
    let call;
    let myDid, myVerkey, targetDid, targetVerkey;
    await indyTransClient.doOnBoarding()
        .then(res => {
            [call, myDid, myVerkey, targetDid, targetVerkey] = res;
            return indyTransClient.getCredential(call, myDid, myVerkey, targetVerkey, credDefId)
        })
        .then(res => {
            console.log(res);
        });
}

async function main() {

    // 启动 Steward
    await steward();

    //启动 Government 创建证书模式
    let schemaId = await government();

    console.error('----------------------------');
    console.log(schemaId);
    console.error('----------------------------');
    // 启动Faber
    let credDefId = await faber(schemaId);

    // 启动alice获取证书
    await alice(credDefId);

    process.exit(0);
}

main();