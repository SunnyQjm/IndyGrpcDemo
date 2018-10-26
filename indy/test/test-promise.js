function test(a, ...args) {
    const globalStore = {};
    globalStore.a = 'as';
    [globalStore.b, globalStore.c] = ['asdf', 'sadf'];
    console.log(globalStore);

}

test(1, 2, 3, 4, 5);
test(1, [2, 3, 4, 5]);
