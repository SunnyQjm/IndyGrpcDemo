const indy = require('indy-sdk');
const util = require('../utils/util');

class IndyNode {
    constructor(name) {
        this.nodeName = name;
    }

    /////////////////////////////////////////////////////
    //////// 下面包含一些检测函数
    /////////////////////////////////////////////////////

    /**
     * 确保当前对象打开了一个钱包
     */
    ensureWalletExist() {
        if (!this.walletHandle) {
            throw Error('Wallet not exist');
        }
    }

    /**
     * 确保当前对象连接了一个节点池
     */
    ensurePoolHandleExist() {
        if (!this.poolHandle) {
            throw Error('Pool handle not exist');
        }
    }

    /**
     * 确保当前对象有一个可以操作账本的 Verinym Did
     */
    ensureCurrentVerinymDid() {
        if (!this.currentVerinymDid) {
            throw Error('Current VerinymDid is not set');
        }
    }


    /////////////////////////////////////////////////////////////
    ////////  下面是对indy SDK 封装的一些常用操作
    /////////////////////////////////////////////////////////////

    /**
     * 创建连接池配置
     * @param poolName
     * @param poolConfig
     * @returns {Promise<void>}
     */
    async createPoolLegerConfigIfNotExists(poolName, poolConfig) {
        try {
            await indy.createPoolLedgerConfig(poolName, poolConfig);
        } catch (e) {
            if (e.message !== "PoolLedgerConfigAlreadyExistsError") {
                throw e;
            } else {
                console.log(`============Pool config for ${poolName} is exist, not create=============`);
            }
        }
    }

    /**
     * 打开一个到节点池账本的连接
     * @param poolName
     * @returns {Promise<any>}
     */
    openPoolLeger(poolName) {
        const that = this;
        return new Promise((resolve, reject) => {
            indy.openPoolLedger(poolName)
                .then(res => {
                    //保存poolHandle
                    that.poolHandle = res;
                    resolve(res);
                })
                .catch(reject);
        });
    }


    /**
     * 简单的连接测试网络的节点池，并连接账本获得一个处理账本的句柄
     * @param poolName
     * @returns {Promise<any | never>}
     */
    easyCreateTestPoolConfigAndOpenIt(poolName) {
        const that = this;
        return util.getPoolGenesisTxnPath(poolName)         //生成配置文件（包含创世事务）
            .then(async poolGenesisTxnPath => {
                /**
                 * 设置全局属性PROTOCOL_VERSION的值，在之后每一个对pool的请求中都会包含这个协议版本号
                 */
                await indy.setProtocolVersion(2);
                let poolConfig = {
                    "genesis_txn": poolGenesisTxnPath
                };
                await that.createPoolLegerConfigIfNotExists(poolName, poolConfig);
                return that.openPoolLeger(poolName);
            });

    }

    /**
     * 通过原生的配置创建钱包
     * @param walletConfig
     * @param walletCredentials
     * @returns {Promise<void>}
     */
    createWalletIfNotExists(walletConfig, walletCredentials) {
        const that = this;
        return indy.createWallet(walletConfig, walletCredentials)
            .then(res => {
                //创建成功则更新当前配置
                that.walletConfig = walletConfig;
                that.walletCredentials = walletCredentials;
                return Promise.resolve(1);
            })
            .catch(err => {
                if (err.message !== "WalletAlreadyExistsError") {
                    return Promise.reject(err);
                } else {
                    console.log(`============Wallet for ${JSON.stringify(walletConfig)}, ${JSON.stringify(walletCredentials)} is exist, not create=============`);
                    //钱包已存在，则不用创建，但需要保存配置
                    that.walletConfig = walletConfig;
                    that.walletCredentials = walletCredentials;
                    return Promise.resolve(1);
                }
            });
    }

    /**
     * 打开钱包
     * @returns {Promise<void>}
     */
    openWallet() {
        const that = this;
        return new Promise((resolve, reject) => {
            if (!!that.walletConfig && !!that.walletCredentials) {   //配置正常，则尝试打开
                indy.openWallet(that.walletConfig, that.walletCredentials)
                    .then(walletHandle => {
                        that.walletHandle = walletHandle;
                        resolve(walletHandle)
                    })
                    .catch(reject)
            } else {
                reject(Error('Wallet Config Not Exist'));
            }
        });
    }

    /**
     * 关闭当前钱包
     */
    closeWallet() {
        this.ensureWalletExist();
        return indy.closeWallet(this.walletHandle);
    }

    deleteWallet(walletConfig, walletCredentials) {
        this.ensureWalletExist();
        return indy.deleteWallet(walletConfig, walletCredentials);
    }

    /**
     * 删除当前打开的钱包
     * @returns {*}
     */
    closeAndDeleteWallet() {
        this.ensureWalletExist();
        const that = this;
        return that.closeWallet()
            .then(res => {
                return that.deleteWallet(this.walletConfig, this.walletCredentials);
            });
    }

    /**
     * 如果不存在则根据配置创建钱包, 接着打开钱包
     * @param walletConfig
     * @param walletCredentials
     * @returns {Promise<void>}
     */
    createWalletIfNotExistsAndThenOpenIT(walletConfig, walletCredentials) {
        const that = this;
        return that.createWalletIfNotExists(walletConfig, walletCredentials)
            .then(res => {
                return that.openWallet()
            });
    }


    /**
     * 根据一个指定的种子在当前节点的钱包中创建一个Did，并保存在钱包当中
     * 同时当前节点对象的
     * @param seed
     * @returns {*} [ did: String, verkey: String ]
     */
    createAndStoreDidBySeed(seed) {
        //首先保证钱包存在并打开了，否则抛出异常
        this.ensureWalletExist();

        const that = this;
        return indy.createAndStoreMyDid(this.walletHandle, {
            seed: seed
        })
    }

    /**
     * 随机生成一个seed并用它生成 Did 和 Verkey
     * 这个随机生成的标识通常用于建立安全连接时使用，仅当前连接有效
     * @returns {*} [ did: String, verkey: String ]
     */
    createAndStoreDidRandom() {
        this.ensureWalletExist();
        return indy.createAndStoreMyDid(this.walletHandle, {});
    }


    /**
     * 证书的申请者在本地钱包创建一个Master SecretId
     * @param masterSecretId 创建指定的ID（这个ID必须唯一，重复创建会报错）
     * @return {*} [outMasterSecretId: String]
     */
    proverCreateMasterSecret(masterSecretId = null) {
        this.ensureWalletExist();
        return indy.proverCreateMasterSecret(this.walletHandle);
    }


    /**
     * 根据指定的 credOffer 创建一个credRequest
     * @param proverDid
     * @param credOffer         证书Offer
     * @param credDef           证书定义
     * @param masterSecretId    prover生成的masterSecretId
     *
     * @returns {*} [ credReq: Object, credReqMetadata: Object ]
     */
    proverCreateCredentialReq(proverDid, credOffer, credDef, masterSecretId) {
        this.ensureWalletExist();
        return indy.proverCreateCredentialReq(this.walletHandle, proverDid, credOffer, credDef, masterSecretId);
    }

    /**
     * 证书申请者 验证证书的有效性，并将证书存储到自己的钱包当中
     * @param credId            指定保存在本地时关联的证书id，这是可选的，如果传null则会生成一个随机的id
     * @param credRequestMeta   证书请求的元数据（执行proverCreateCredentialReq得到）
     * @param cred              证书
     * @param credDef           证书定义
     * @param revRegDef         撤销注册表定义
     * @returns {*} [outCredId: String]
     */
    proverStoreCredential(credId, credRequestMeta, cred, credDef, revRegDef = null) {
        this.ensureWalletExist();
        return indy.proverStoreCredential(this.walletHandle, credId, credRequestMeta, cred, credDef, revRegDef);
    }


    /**
     * 获取瞒住filter过滤条件的证书列表
     * @param filter    证书过滤参数
                  {
                   "schema_id": string, (Optional)
                   "schema_issuer_did": string, (Optional)
                   "schema_name": string, (Optional)
                   "schema_version": string, (Optional)
                   "issuer_did": string, (Optional)
                   "cred_def_id": string, (Optional)
                  }
     * @return {*}  [credentials: Array]    返回满足条件的证书列表
     */
    proverGetCredentials(filter) {
        this.ensureWalletExist();
        return indy.proverGetCredentials(this.walletHandle, filter);
    }

    /**
     * 通过证书Id获取指定的证书
     * @param credId     证书Id
     *
     * @return {*} [credential: Object]
     */
    proverGetCredential(credId) {
        this.ensureWalletExist();
        return indy.proverGetCredential(this.walletHandle, credId);
    }


    /////////////////////////////////////////////////////////////////////////////////
    //////// 构造一些请求提和返回体信息
    /////////////////////////////////////////////////////////////////////////////////

    /**
     * 构造一个连接请求
     * @param fromToDid
     * @returns {{did: *, nonce: *}}
     */
    buildConnectionRequest(fromToDid) {
        return {
            did: fromToDid,
            nonce: IndyNode.randomNonce()       //随机生成一个Nonce
        }
    }

    /**
     * 构造一个连接返回消息
     * @param toFromDid
     * @param toFromVerkey
     * @param nonce
     * @returns {{did: *, verkey: *, nonce: *}}
     */
    buildConnectionResponse(toFromDid, toFromVerkey, nonce) {
        return {
            'did': toFromDid,
            'verkey': toFromVerkey,
            'nonce': nonce
        };
    }

    /////////////////////////////////////////////////////////////////////////////////
    ///////// 下面是一些加解密函数封装
    /////////////////////////////////////////////////////////////////////////////////

    /**
     * 用 匿名加密方案(用对方的公钥对消息进行加密，对方可用自己的私钥解密) 对消息进行加密
     * @param receiverVerkey            接收密文者的公钥
     * @param data: Buffer              要加密消息
     * @return {*}  [encryptedMsgRaw: Buffer]
     */
    cryptoAnonCrypt(receiverVerkey, data) {
        let json = data;
        if (typeof data === 'object') {
            json = JSON.stringify(data);
        }
        return indy.cryptoAnonCrypt(receiverVerkey, Buffer.from(json, 'utf8'));
    }

    /**
     * 用 匿名加密方案(用对方的公钥对消息进行加密，对方可用自己的私钥解密) 对密文进行解密
     * @param receiverVerkey        接收密文者的公钥（应该可以通过这个公钥接收者本地的钱包中得到秘钥，来对消息进行解密）
     * @param msgRaw: Buffer        密文
     * @return {*} [decryptedMsgRaw: Buffer]
     */
    cryptoAnonDecrypt(receiverVerkey, msgRaw) {
        this.ensureWalletExist();
        return indy.cryptoAnonDecrypt(this.walletHandle, receiverVerkey, msgRaw)
            .then(bufferData => {
                return Promise.resolve(JSON.parse(Buffer.from(bufferData, 'utf8').toString()))
            })
    }


    /**
     * 用 认证加密方案（就是两对公私钥计算出共享秘钥的方式）对消息进行加密
     * @param sendVk                    发送加密消息者的verkey
     * @param receiverVk                接收加密消息者的verkey
     * @param msgRaw: Buffer            要被加密的数据
     * @return {*}  [encryptedMsgRaw: Buffer]
     */
    cryptoAuthCrypt(sendVk, receiverVk, msgRaw) {
        this.ensureWalletExist();
        console.log('auth crypt: ' + msgRaw);
        let json = msgRaw;
        if (typeof msgRaw === 'object') {
            json = JSON.stringify(msgRaw);
        }
        return indy.cryptoAuthCrypt(this.walletHandle, sendVk, receiverVk, Buffer.from(json, 'utf8'));
    }

    /**
     * 用 认证加密方案（就是两对公私钥计算出共享秘钥的方式）对密文进行解密
     * @param receiverVk            接收密文者的verkey
     * @param data: Buffer          密文
     * @return {*}  [sendVk: String, decryptedMsgRaw: Buffer]
     */
    cryptoAuthDecrypt(receiverVk, data) {
        this.ensureWalletExist();
        return indy.cryptoAuthDecrypt(this.walletHandle, receiverVk, Buffer.from(data))
            .then(res => {
                let [senderVerkey, authDecryptDidInfoJSON] = res;
                console.log('auth decrypt： ');
                console.log(authDecryptDidInfoJSON);
                console.log('auth decrypt and parse: ');
                console.log(JSON.parse(authDecryptDidInfoJSON));
                return Promise.resolve([senderVerkey, JSON.parse(authDecryptDidInfoJSON)])
            })
    }

    /**
     * 更新当前的Verinym Did
     * @param verrinymDid
     */
    updateCurrentVerinymDid(verrinymDid) {
        this.currentVerinymDid = verrinymDid;
    }


    ///////////////////////////////////////////////////////////////////////////////////
    ///////// 下面是证书相关的封装函数
    ///////////////////////////////////////////////////////////////////////////////////

    /**
     * 用当前节点的 Verinym Did 签署发布一个证书模式
     * @param certificationName
     * @param certificationVersion
     * @param certificationProps
     * @returns {*} [ id: String, schema: Object ]
     */
    issuerCreateSchema(certificationName, certificationVersion, certificationProps) {
        this.ensureCurrentVerinymDid();
        if(!Array.isArray(certificationProps)) {
            throw Error('certificationProps must be array');
        }
        return indy.issuerCreateSchema(this.currentVerinymDid, certificationName, certificationVersion, certificationProps);
    }

    /**
     * 用当前节点的 Verinym Did 签署发布一个证书定义
     * @param transcriptSchema          证书的模式定义
     * @param tag                       标签（可用于区分同一个issuer，根据同一个schema发布的不同CredentialDef）
     * @param signatureType             签名类型（default - 'CL'）
     * @param config                    签名配置
     * @returns {*}  [ credDefId: String, credDef: Object ]
     */
    issuerCreateAndStoreCredentialDef(transcriptSchema, tag, signatureType, config) {
        this.ensureWalletExist();
        this.ensureCurrentVerinymDid();
        return indy.issuerCreateAndStoreCredentialDef(this.walletHandle,
            this.currentVerinymDid, transcriptSchema, tag, signatureType, config)
    }

    /**
     * 发布一个证书Offer, 证书的使用者会用这个offer去请求证书
     * @param credDefId   证书定义id
     *
     * @returns {*} [credOffer: Object]
     */
    issuerCreateCredentialOffer(credDefId) {
        this.ensureWalletExist();
        return indy.issuerCreateCredentialOffer(this.walletHandle, credDefId);
    }

    /**
     * 检查credRequest的有效性，并创建一个证书（包含详细信息）
     *  1. credOffer 和 credRequest 要匹配
     *  2. cred definition 和 cred offer 要求已经创建并存在与本地的wallet中
     * @param credOffer         证书offer
     * @param credRequest       证书请求
     * @param credValues        证书内容
     * @param revRegId
     * @param blogStorageHandle
     * @return {*} [ cred: Object, credRevocId: String, revocRegDelta: Object ]
     */
    issuerCreateCredential(credOffer, credRequest, credValues, revRegId = null, blogStorageHandle = -1) {
        this.ensureWalletExist();
        return indy.issuerCreateCredential(this.walletHandle, credOffer, credRequest, credValues, revRegId,
            blogStorageHandle);
    }
    /////////////////////////////////////////////////////////////////////////////////
    /////////  下面包含节点对账本的操作
    /////////////////////////////////////////////////////////////////////////////////

    /**
     * 通过did在全局账本中搜索对应的verkey，并缓存到本地的钱包当中
     * @param did
     */
    findKeyForDidAndCacheToLocalWallet(did) {
        /**
         * keyForDid 函数会根据提供的Did，从poolHandle指向的节电池的账本中读取这个Did相关连的信息，并把这些数据缓存到本地的钱包当中
         * 如果希望只查询本地缓存，而不是查询账本，可以调用 keyForLocalDid
         *
         * => 最终会在Promise的回调当中返回该Did对应的验证公钥（Verkey），如果有需要的话可以用这个验证公钥来验证收到的请求数据没有被篡改
         *    （不过在这个示例当中，请求数据是明文传送的，也没有加签名，不需要验证），这个示例当中则用这个公钥加密Response信息，因为私钥
         *    只在Did的所有者的钱包中包含，也就意味着只有发起请求的客户端可以解密这个Response
         */
        this.ensurePoolHandleExist();
        this.ensureWalletExist();
        return indy.keyForDid(this.poolHandle, this.walletHandle, did);
    }

    /**
     * 构造并发送一个NYM请求
     *
     * NYM transaction说明：
     *      The NYM transaction can be used for creation of new DIDs that is known to that ledger, the setting and rotation of a verification key, and the setting and changing of roles
     *      一个NYM transaction可以用来：
     *          1. 忘账本里写入一个did，让did为全局账本所熟知，可以被查阅
     *          2. 设置一个did对应的轮转验证秘钥
     *          3. 修改一个did对应的身份
     // * @param Did                   提交者（submitter）所用的身份Did
     * @param targetId              目标 did
     * @param targetVerkey          目标 验证公钥
     * @param role                  目标角色
     *                                  default -> USER
     *                                  TRUST_STEWARD
     *                                  TRUST_ANCHOR
     * @returns {Promise<void>}
     */
    sendNym(targetId, targetVerkey, role) {
        this.ensureWalletExist();
        this.ensurePoolHandleExist();
        this.ensureCurrentVerinymDid();
        const that = this;
        return indy.buildNymRequest(that.currentVerinymDid, targetId, targetVerkey, null, role)        //构造请求
            .then(nymRequest => {
                //将请求用提交者的私钥签名，并提交事务给账本，参与共识
                return indy.signAndSubmitRequest(that.poolHandle, this.walletHandle, that.currentVerinymDid, nymRequest);
            });

    }


    /**
     * 将一个证书模式用当前节点的身份保存到账本当中
     * @param certificationSchema
     * @returns {PromiseLike<T | never> | Promise<T | never>}
     */
    sendSchema(certificationSchema) {
        this.ensurePoolHandleExist();
        this.ensureWalletExist();
        this.ensureCurrentVerinymDid();
        return indy.buildSchemaRequest(this.currentVerinymDid, certificationSchema)
            .then(schemaRequest => {
                return indy.signAndSubmitRequest(this.poolHandle, this.walletHandle, this.currentVerinymDid, schemaRequest);
            })
    }

    /**
     * 讲一个证书定义用当前节点的身份保存到账本当中
     * @param credDef
     */
    sendCredDef(credDef) {
        this.ensurePoolHandleExist();
        this.ensureWalletExist();
        this.ensureCurrentVerinymDid();
        return indy.buildCredDefRequest(this.currentVerinymDid, credDef)
            .then(credDefRequest => {
                return indy.signAndSubmitRequest(this.poolHandle, this.walletHandle, this.currentVerinymDid, credDefRequest);
            })
    }

    /**
     * 通过模式Id查询模式定义
     * @param schemaId
     * @param submitterDid
     */
    getSchema(schemaId, submitterDid) {
        this.ensurePoolHandleExist();
        if(!submitterDid)
            this.ensureCurrentVerinymDid();
        let _submitterDid = submitterDid ? submitterDid : this.currentVerinymDid;
        const that = this;
        return indy.buildGetSchemaRequest(_submitterDid, schemaId)
            .then(getSchemaRequest => {
                return indy.submitRequest(that.poolHandle, getSchemaRequest)
            })
            .then(getSchemaResponse => {
                return indy.parseGetSchemaResponse(getSchemaResponse);
            })
    }

    /**
     * 通过证书定义Id查询证书定义
     * @param credDefId
     * @param submitterDid
     */
    getCredDef(credDefId, submitterDid) {
        this.ensurePoolHandleExist();
        if(!submitterDid)
            this.ensureCurrentVerinymDid();
        let _submitterDid = submitterDid ? submitterDid : this.currentVerinymDid;
        const that = this;
        return indy.buildGetCredDefRequest(_submitterDid, credDefId)
            .then(getCredDefRequest => {
                return indy.submitRequest(that.poolHandle, getCredDefRequest)
            })
            .then(getCredDefResponse => {
                return indy.parseGetCredDefResponse(getCredDefResponse);
            })
    }


    ///////////////////////////////////////////////////////////////////////////////////
    ///////// 下面是一些静态的工具函数
    ///////////////////////////////////////////////////////////////////////////////////

    /**
     * 随机生成一个足够大的数字
     */
    static randomNonce(min = 1000, max = 100000000) {
        let range = max - min;
        let random = Math.random();
        return min + Math.round(random * range);
    }
}

module.exports = IndyNode;