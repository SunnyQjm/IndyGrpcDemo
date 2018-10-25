function test(a, ...args) {
    console.log(Array.isArray(args));
    console.log(args);
}

test(1, 2, 3, 4, 5);
test(1, [2, 3, 4, 5]);
