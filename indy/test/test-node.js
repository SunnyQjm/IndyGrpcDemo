const IndyNode = require('../IndyNode');

let indyNode = new IndyNode('Node1');
indyNode
    .easyCreateTestPoolConfigAndOpenIt('pool1')
    .then(async poolHandle => {
        console.log('open pool success');
        console.log(poolHandle);
        await indyNode.createWalletIfNotExistsAndThenOpenIT({
            'id': 'stewardWallet'
        }, {
            'key': 'steward_key'
        })
            .then(walletHandle => {
                console.log(`walletHandle: ${walletHandle}`);

            })
            .catch(err => {
                console.log(err);
            });

        // await indyNode.createAndStoreDidBySeed('000000000000000000000000Steward1')
        //     .then(res => {
        //         console.log(res);
        //     })
        //     .catch(err => {
        //         console.log(err);
        //     });
        await indyNode.createAndStoreDidRandom()
            .then(res => {
                console.log(res);
            })
            .catch(err => {
                console.log(err);
            })
    })
    .catch(err => {
        console.log('what? error?');
        console.log(err);
    });
