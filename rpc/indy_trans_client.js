const PROTO_PATH = __dirname + '/protos/indy_trans.proto';

const grpc = require('grpc');
const protoLoader = require('@grpc/proto-loader');
const {Code} = require('./indy_trans_config');
const debuger = require('../utils/debuger');

const packageDefine = protoLoader.loadSync(
    PROTO_PATH,
    {
        keepCase: true,
        longs: true,
        enums: true,
        defaults: true,
        oneofs: true
    }
);

const indyTransProto = grpc.loadPackageDefinition(packageDefine).indy_demo;


class IndyTransClient extends indyTransProto.IndyTrans {
    constructor(ip, port, indyNode) {
        super(`${ip}:${port}`, grpc.credentials.createInsecure());
        this.indyNode = indyNode;
    }
    static dealError(err, call) {
        console.error(err);
        // getVrinym 错误，告知客户端
        call.end();
    }
    /**
     * 向一个 TrustAnchor 级的节点申请获得一个身份
     * @returns {Promise<any>}
     */
    getVerinymDid(call, role, senderVk, receiverVk) {
        const that = this;
        return new Promise((resolve, reject) => {
            let toDid, tokey;
            call.on('data', data => {
                switch (data.code) {
                    case Code.GET_VERINYM_SUCCESS:
                        resolve(toDid);
                        break;
                    case Code.ERROR:
                        reject(Error('getVerinym fail'));
                        break;
                }
            });
            that.indyNode.createAndStoreDidRandom()
                .then(res => {              //创建一个Did和Verkey对，用来准备作为 Verinym 身份
                    [toDid, tokey] = res;
                    return that.indyNode.cryptoAuthCrypt(senderVk, receiverVk, {
                        did: toDid,
                        verkey: tokey,
                        role: role,
                    })
                })
                .then(authCryptedDidInfo => {
                    //将加密后的请求数据发到服务器端
                    call.write({
                        code: Code.GET_VERINYM_REQUEST,
                        msg: authCryptedDidInfo,
                    })
                })
                .catch(reject);
        });
    }

    /**
     * 获取证书
     * @param call
     * @param senderDid
     * @param myVerKey
     * @param targetVerkey
     * @param credDefId
     */
    getCredential(call, senderDid, myVerKey, targetVerkey, credDefId) {
        const that = this;
        return new Promise((resolve, reject) => {
            that.indyNode.cryptoAuthCrypt(myVerKey, targetVerkey, {credDefId})
                .then(authCryptInfo => {
                    call.write({
                        code: Code.GET_CREDENTIAL_GET_CRED_DEF_REQUEST,
                        msg: authCryptInfo,
                    });
                })
                .catch(reject);
            let credReqMetadataJson, gCredDef;
            call.on('data', data => {
                let dataMsg = '';
                try {
                    dataMsg = JSON.parse(data.msg.toString());
                    debuger.logDebug(`${that.indyNode.nodeName} --- Receive data`, `code: ${data.code}`, dataMsg)
                } catch (e) {
                    debuger.logDebug(`${that.indyNode.nodeName} --- Receive data`, `code: ${data.code}`, data.msg)
                }
                switch (data.code) {
                    case Code.GET_CREDENTIAL_OFFER_RESPONSE:              //处理机构返回的证书Offer
                        that.indyNode.cryptoAuthDecrypt(myVerKey, data.msg)
                            .then(async res => {
                                let [sendVerkey, authDecryptCredOffer] = res;
                                //在本地钱包创建一个MasterSecretId
                                let masterSecretId = await that.indyNode.proverCreateMasterSecret();

                                // 客户端通过机构返回的加密信息中包含的证书Id，得到证书的定义信息
                                let [credDefId, credDef] = await that.indyNode
                                    .getCredDef(authDecryptCredOffer['cred_def_id'], senderDid);
                                gCredDef = credDef;
                                return Promise.resolve([sendVerkey, authDecryptCredOffer, credDefId, credDef, masterSecretId])
                            })
                            .then(res => {
                                let [sendVerkey, authDecryptCredOffer, credDefId, credDef, masterSecretId] = res;

                                // 欲获取证书一方，构造请求证书详细信息的请求体
                                return that.indyNode
                                    .proverCreateCredentialReq(senderDid, authDecryptCredOffer,
                                        credDef, masterSecretId)
                            })
                            .then(res => {
                                let [credRequestJson, credRequestMetadataJson] = res;
                                credReqMetadataJson = credRequestMetadataJson;
                                //将请求信息加密
                                return that.indyNode.cryptoAuthCrypt(myVerKey, targetVerkey, credRequestJson)
                            })
                            .then(authCryptCredRequest => {

                                //将加密后的信息传输给机构
                                call.write({
                                    code: Code.GET_CREDENTIAL_GET_CRED_DETAIL_REQUEST,
                                    msg: authCryptCredRequest
                                });
                            })
                            .catch(reject);
                        break;
                    case Code.GET_CREDENTIAL_CREDENTIAL_RESPONSE:
                        that.indyNode.cryptoAuthDecrypt(myVerKey, data.msg)
                            .then(res => {
                                let [, authDecryptCred] = res;
                                if(Array.isArray(authDecryptCred)) {
                                    authDecryptCred = authDecryptCred[0];
                                }
                                debuger.logDebug('成功接收到证书', JSON.stringify(authDecryptCred), credReqMetadataJson, gCredDef);
                                return that.indyNode.proverStoreCredential(null, credReqMetadataJson,
                                    JSON.stringify(authDecryptCred), gCredDef);
                            })
                            .then(res => {
                                resolve(res);
                                console.log('获取证书成功并保存到钱包当中')
                            })
                            .catch(reject);
                        break;
                }
            });
        });

    }

    /**
     * 一个没有 THRUST_ANCHOR 身份的节点期望连接到一个 有 THRUST_ANCHOR 身份的节点
     */
    doOnBoarding() {
        const that = this;
        const call = this.onboarding();
        return new Promise((resolve, reject) => {
            let communicationDid, communicationVerkey;
            //连接预请求
            call.write({
                code: Code.ON_BOARDING_PRE_REQUEST
            });
            let targetVerkey = '';
            let targetDid = '';
            call.on('data', async data => {
                let dataMsg = '';
                try {
                    dataMsg = JSON.parse(data.msg.toString());
                    debuger.logDebug(`${that.indyNode.nodeName} --- Receive data`, `code: ${data.code}`, dataMsg)
                } catch (e) {
                    debuger.logDebug(`${that.indyNode.nodeName} --- Receive data`, `code: ${data.code}`, data.msg)
                }
                switch (data.code) {
                    case Code.ON_BOARDING_REQUEST:
                        //生成一对用于安全通信的临时身份
                        [communicationDid, communicationVerkey] = await that.indyNode.createAndStoreDidRandom();

                        targetDid = dataMsg.did;
                        //从账本中查到对端服务器用于本次安全通信的Verkey
                        await that.indyNode.findKeyForDidAndCacheToLocalWallet(dataMsg.did)
                            .then(fromToVerkey => {
                                targetVerkey = fromToVerkey;

                                //构造 ConnectionResponse
                                let connectionResponse = that.indyNode.buildConnectionResponse(communicationDid,
                                    communicationVerkey, dataMsg.nonce);

                                //将connectionResponse 加密
                                return that.indyNode.cryptoAnonCrypt(fromToVerkey, connectionResponse);
                            })
                            .then(anoncryptedConnectionResponse => {
                                call.write({
                                    code: Code.ON_BOARDING_RESPONSE,
                                    msg: anoncryptedConnectionResponse,
                                });
                            })
                            .catch(err => {
                                reject(err);
                            });
                        break;
                    case Code.ON_BOARDING_SUCCESS:      //onboarding 成功
                        resolve([call, communicationDid, communicationVerkey, targetDid, targetVerkey]);
                        break;

                    case Code.ERROR:
                        call.end();
                        let errMsg = dataMsg;
                        if (typeof dataMsg === 'object') {
                            errMsg = JSON.stringify(dataMsg);
                        }
                        debuger.errorDebug({
                            message: errMsg
                        });
                        reject(Error(errMsg));
                        break;
                }
            });
            call.on('end', function () {
                call.end();
            })
        });
    }
}

module.exports = IndyTransClient;
