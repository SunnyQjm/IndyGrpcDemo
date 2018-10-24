async function test() {
    return 1;
}

test()
.then(res => {
    console.log(res);
})
.catch(err => {
    console.log(err);
})