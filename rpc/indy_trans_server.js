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
        this.sendBytesReceiveBytes = this.sendBytesReceiveBytes.bind(this);
        this.sendStreamReceiveStream = this.sendStreamReceiveStream.bind(this);
        this.onboarding = this.onboarding.bind(this);

        //添加协议提供的服务
        this.addService(indyTransProto.IndyTrans.service, {
            onboarding: that.onboarding,
        });
    }

    /**
     * 实现onboarding 流程
     * @param call
     */
    onboarding(call) {
        const that = this;
        //用来存储用于临时通信的 Did 和 Verkey 对
        let fromToDid, fromToKey, nonce;
        call.on('data', async function (data) {
            let dataMsg = '';
            try {
                dataMsg = JSON.parse(data.msg.toString());
                debuger.logDebug(`${that.indyNode.nodeName} --- Receive data`, `code: ${data.code}`, dataMsg)
            } catch (e) {
                debuger.logDebug(`${that.indyNode.nodeName} --- Receive data`, `code: ${data.code}`, data.msg)
            }

            switch (data.code) {
                case Code.NOT_DEFINE:
                    break;
                case Code.ON_BOARDING_PRE_REQUEST:      //onboarding 预请求
                    await that.indyNode.createAndStoreDidRandom()
                        .then(arr => {
                            [fromToDid, fromToKey] = arr;
                            return that.indyNode.sendNym(fromToDid, fromToKey, null);
                        })
                        .then(res => {
                            let connectionRequest = that.indyNode.buildConnectionRequest(fromToDid);
                            nonce = connectionRequest.nonce;
                            //构造一个连接请求体
                            call.write({
                                code: Code.ON_BOARDING_REQUEST,
                                msg: Buffer.from(JSON.stringify(connectionRequest), 'utf8')
                            });
                        })
                        .catch(err => {     //处理onboarding预请求过程中发生错误
                            debuger.logDebug('onboarding 错误', err);
                            call.write(Buffer.from(
                                JSON.stringify({
                                    code: Code.ERROR,
                                    msg: err.message
                                })
                            ))
                        });
                    break;
                case Code.ON_BOARDING_RESPONSE:         //onboarding 连接建立成功的回调
                    await that.indyNode.decryptoAnonCrypt(fromToKey, data.msg)
                        .then(decryptedConnectionResponse => {
                            if(nonce !== decryptedConnectionResponse.nonce) {       //nonce不匹配
                                call.write({
                                    code: Code.ERROR,
                                    msg: Buffer.from({
                                        message: 'nonce not match'
                                    })
                                });
                                call.end();
                                return Promise.reject(Error('nonce not match'))
                            } else {
                                //将目标设备用于本次通信的Did和Verkey存到账本当中。
                                //(值得一提的是，现在发起端应该默认是THRUST_ANCHOR，而对端不是，所以只能在发起端写入账本，而不能在目标设备上写入，目标设备现在还不具有THRUST_ANCHOR这一层身份，不能操作账本)
                                return that.indyNode.sendNym(decryptedConnectionResponse.did, decryptedConnectionResponse.verkey, null);
                            }
                        })
                        .then(res => {  //保存到账本成功

                            //告知客户端 onboarding 流程成功
                            call.write({
                                code: Code.ON_BOARDING_SUCCESS
                            });
                        })
                        .catch(err => {
                            console.log(err);
                        });
                    break;
            }
        });
        call.on('end', function () {        //如果客户端调用了结束，服务端跟着结束
            call.end();
        })
    }

}


module.exports = IndyTransServer;