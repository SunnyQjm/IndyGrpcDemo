
const Code = {
    ERROR: -1,                  //通信过程中发送错误
    NOT_DEFINE: 0,
    ON_BOARDING_PRE_REQUEST: 1, // 《onboarding》一个没有 TRUST_ANCHOR 身份的节点想连接到一个具有 TRUST_ANCHOR 级的节点请求信息（内容为空）
    ON_BOARDING_REQUEST: 2,     // 《onboarding》TRUST_ANCHOR（from） 一端向 客户端（to）发送连接请求
    ON_BOARDING_RESPONSE: 3,    // 《onboarding》to 返回加密信息给 from
    ON_BOARDING_SUCCESS: 4,     // 《onboarding》成功
};

module.exports = {
    Code,
};