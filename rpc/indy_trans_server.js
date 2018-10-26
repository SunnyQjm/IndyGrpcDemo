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


class IndyTransServer extends grpc.Server {
    constructor(ip, port, indyNode) {
        super();
        this.indyNode = indyNode;

        //绑定监听的IP和端口
        this.bind(`${ip}:${port}`, grpc.ServerCredentials.createInsecure());

        const that = this;
        // this.sendBytesReceiveBytes = this.sendBytesReceiveBytes.bind(this);
        // this.sendStreamReceiveStream = this.sendStreamReceiveStream.bind(this);
        this.onboarding = this.onboarding.bind(this);

        //添加协议提供的服务
        this.addService(indyTransProto.IndyTrans.service, {
            onboarding: that.onboarding,
            // getVerinym: that.getVerinym
        });
    }

    static dealError(err, call) {
        console.error(err);
        // getVrinym 错误，告知客户端
        call.write({
            code: Code.ERROR,
            msg: Buffer.from(JSON.stringify(err), 'utf8')
        });
    }

    /**
     * 处理onboarding 请求
     * @param call
     * @param data
     * @param globalStore
     */
    dealOnBoarding(call, data, globalStore) {
        const that = this;
        switch (data.code) {
            case Code.ON_BOARDING_PRE_REQUEST:      //onboarding 预请求
                that.indyNode.createAndStoreDidRandom()
                    .then(arr => {
                        //将我方用于本次通信的 Did 和 Verkey 存到本次 Session 的全局状态中
                        [globalStore.myDid, globalStore.myVerkey] = arr;

                        //将我方用于通信的 Did 和 Verkey存到账本当中（这样，对端就可验证和获取）
                        return that.indyNode.sendNym(globalStore.myDid, globalStore.myVerkey, null);
                    })
                    .then(res => {
                        //构造一个连接请求体（nonce是一个大的随机数）
                        let connectionRequest = that.indyNode.buildConnectionRequest(globalStore.myDid);

                        //将nonce存到Session的全局状态当中
                        globalStore.nonce = connectionRequest.nonce;

                        //构造一个 RPC 通信消息，发送给客户端
                        call.write({
                            code: Code.ON_BOARDING_REQUEST,
                            msg: Buffer.from(JSON.stringify(connectionRequest), 'utf8')
                        });
                    })
                    .catch(err => {     //处理onboarding预请求过程中发生错误
                        debuger.logDebug('onboarding 错误', err);
                        IndyTransServer.dealError(err, call);
                    });
                break;
            case Code.ON_BOARDING_RESPONSE:         //onboarding 连接建立成功的回调
                //用我方 verkey 和本地钱包解密信息
                that.indyNode.cryptoAnonDecrypt(globalStore.myVerkey, data.msg)
                    .then(async decryptedConnectionResponse => {
                        if (globalStore.nonce !== decryptedConnectionResponse.nonce) {       //nonce不匹配
                            call.write({
                                code: Code.ERROR,
                                msg: Buffer.from({
                                    message: 'nonce not match'
                                })
                            });
                            call.end();
                            return Promise.reject(Error('nonce not match'))
                        } else {
                            //将通信对方的did和Verkey保存
                            [globalStore.targetDid, globalStore.targetVerkey] =
                                [decryptedConnectionResponse.did, decryptedConnectionResponse.verkey];

                            //将目标设备用于本次通信的Did和Verkey存到账本当中。
                            //(值得一提的是，现在发起端应该默认是THRUST_ANCHOR，而对端不是，所以只能在发起端写入账本，而不能在目标设备上写入，目标设备现在还不具有THRUST_ANCHOR这一层身份，不能操作账本)
                            return that.indyNode.sendNym(decryptedConnectionResponse.did, decryptedConnectionResponse.verkey, null);
                        }
                    })
                    .then(res => {
                        //告知客户端 onboarding 流程成功
                        call.write({
                            code: Code.ON_BOARDING_SUCCESS
                        });
                    })
                    .catch(err => {
                        IndyTransServer.dealError(err, call);
                    });
                break;
        }
    }

    /**
     * 处理 getVerinym Did 请求
     * @param call
     * @param data
     * @param globalStore
     */
    getVerinym(call, data, globalStore) {
        const that = this;
        switch (data.code) {
            case Code.GET_VERINYM_REQUEST:      //处理getVerinym请求
                that.indyNode.cryptoAuthDecrypt(globalStore.myVerkey, Buffer.from(data.msg))
                    .then(async res => {
                        //获得发送者的Verkey和发送者发送的信息的明文字符串
                        let [senderVerkey, authDecryptDidInfo] = res;

                        // let receiverVerkey = await that.indyNode.findKeyForDidAndCacheToLocalWallet(authDecryptDidInfo.did);
                        // console.log('receiverVerkey: ' + receiverVerkey);
                        //
                        // //如果发送者在账本中的Verkey与解密出来的Verkey不一致，则请求失败
                        // if(receiverVerkey !== senderVerkey) {
                        //     return Promise.reject(Error('Verkey is not the same'));
                        // }
                        return that.indyNode.sendNym(authDecryptDidInfo.did, authDecryptDidInfo.verkey, authDecryptDidInfo.role);
                    })
                    .then(res => {  //执行这一步说明身份申请成功，并且已经写入账本
                        call.write({
                            code: Code.GET_VERINYM_SUCCESS,
                        })
                    })
                    .catch(err => {
                        IndyTransServer.dealError(err, call);
                    });
                break;
        }
    }

    /**
     * 处理获取证书相关流程
     * @param call
     * @param data
     * @param globalStore
     */
    getCredential(call, data, globalStore) {
        const that = this;
        let {myDid, myVerkey, targetDid, targetVerkey} = globalStore;
        switch (data.code) {
            case Code.GET_CREDENTIAL_GET_CRED_DEF_REQUEST:       // 处理获取证书的请求
                that.indyNode.cryptoAuthDecrypt(myVerkey, Buffer.from(data.msg))
                    .then(async res => {
                        let [sendVerkey, authDecryptInfo] = res;
                        let {credDefId} = authDecryptInfo;
                        globalStore.credOffer = await that.indyNode.issuerCreateCredentialOffer(credDefId);
                        return [sendVerkey, globalStore.credOffer];
                    })
                    .then(res => {
                        let [sendVerkey, credOfferJson] = res;
                        return that.indyNode.cryptoAuthCrypt(myVerkey, sendVerkey, credOfferJson);
                    })
                    .then(authCryptCredOffer => {
                        // 将加密后的消息发回
                        call.write({
                            code: Code.GET_CREDENTIAL_OFFER_RESPONSE,
                            msg: Buffer.from(authCryptCredOffer, 'utf8')
                        });
                    })
                    .catch(err => {
                        IndyTransServer.dealError(err, call);
                    });
                break;
            case Code.GET_CREDENTIAL_GET_CRED_DETAIL_REQUEST:       //处理获取证书详情
                that.indyNode.cryptoAuthDecrypt(myVerkey, Buffer.from(data.msg))
                    .then(res => {
                        let [proverVerkey, authDecryptCredRequest] = res;

                        // 创建证书的信息
                        let credValues = {
                            "first_name": {"raw": "Alice", "encoded": "1139481716457488690172217916278103335"},
                            "last_name": {"raw": "Garcia", "encoded": "5321642780241790123587902456789123452"},
                            "degree": {"raw": "Bachelor of Science, Marketing", "encoded": "12434523576212321"},
                            "status": {"raw": "graduated", "encoded": "2213454313412354"},
                            "ssn": {"raw": "123-45-6789", "encoded": "3124141231422543541"},
                            "year": {"raw": "2015", "encoded": "2015"},
                            "average": {"raw": "5", "encoded": "5"}
                        };

                        if (!globalStore.credOffer)
                            return Promise.reject('cred offer is not define');

                        //生成证书
                        return that.indyNode.issuerCreateCredential(globalStore.credOffer,
                            JSON.stringify(authDecryptCredRequest), credValues, null, -1);
                    })
                    .then(cred => {
                        //将生成的证书加密
                        return that.indyNode.cryptoAuthCrypt(myVerkey, targetVerkey, cred)
                    })
                    .then(authCryptCredJson => {
                        //将加密后的信息发送给对端设备
                        call.write({
                            code: Code.GET_CREDENTIAL_CREDENTIAL_RESPONSE,
                            msg: authCryptCredJson
                        });
                    })
                    .catch(err => {
                        IndyTransServer.dealError(err, call);
                    });
                break;
        }
    }

    /**
     * 实现onboarding 流程
     * @param call
     */
    onboarding(call) {
        const that = this;

        //用来在同一个请求的全局共享数据
        const globalStore = {};

        call.on('data', async function (data) {
            let dataMsg = '';
            try {
                dataMsg = JSON.parse(data.msg.toString());
                debuger.logDebug(`${that.indyNode.nodeName} --- Receive data`, `code: ${data.code}`, dataMsg)
            } catch (e) {
                debuger.logDebug(`${that.indyNode.nodeName} --- Receive data`, `code: ${data.code}`, data.msg)
            }

            //处理 onboarding 请求
            that.dealOnBoarding(call, data, globalStore);

            //处理 getVerinym 请求
            that.getVerinym(call, data, globalStore);

            //处理获取证书相关请求
            that.getCredential(call, data, globalStore);

            switch (data.code) {
                ////////////////////////////////////////
                ////// 下面情况不作处理
                ////////////////////////////////////////
                case Code.NOT_DEFINE:
                default:
                    break;
            }
        });
        call.on('end', function () {        //如果客户端调用了结束，服务端跟着结束
            call.end();
        })
    }

}


module.exports = IndyTransServer;