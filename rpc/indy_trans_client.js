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
