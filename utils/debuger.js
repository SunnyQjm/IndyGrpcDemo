
const DEBUGE = process.env.DEBUG | true;


///////////////////////////////////////////////////////
//////// 下面是一些日志输出函数
//////////////////////////////////////////////////////
function errorDebug(err) {
    if(DEBUGE) {
        let title = '\n====================' + `${err.message}================`;
        console.error(title);
        console.error(err);
        console.error('='.repeat(title.length) + '\n');
    }
}

function logDebug(title, ...message) {
    if(DEBUGE) {
        let t = '\n====================' + `${title}================`;
        console.log(t);
        message.forEach(v => {
            console.log(v);
        });
        console.log('='.repeat(t.length) + '\n');
    }
}

module.exports = {
    errorDebug,
    logDebug,
};