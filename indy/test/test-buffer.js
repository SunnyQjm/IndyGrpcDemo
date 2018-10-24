
function test() {
    let bufferA = Buffer.from('ABCD', 'utf8');
    let obj = {
        code: 1,
        bufferA: bufferA,
    };
    let bufferB = Buffer.from(JSON.stringify(obj), 'utf8');
    let bufferC = Buffer.concat([Buffer.from(JSON.stringify({code: 1})), bufferA]);
    console.log(bufferA);
    console.log(obj);
    console.log(bufferC);
    console.log(bufferB);

    let objb = JSON.parse(bufferB.toString());
    console.log(JSON.parse(objb.bufferA));
    // console.log(JSON.parse(objb.bufferA.toString('utf8')))
    // console.log(JSON.parse(bufferC.toString()));

}

test();