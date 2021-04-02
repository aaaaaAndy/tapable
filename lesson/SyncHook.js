const { SyncHook, SyncWaterfallHook } = require('tapable');

const hooks = {
	name: new SyncWaterfallHook(['name']),
	age: new SyncHook(['age']),
	info: new SyncHook(['name', 'age', 'address'])
}

hooks.name.tap({ name: 'tapname' }, (name) => {
	console.log(111, name);
	return name;
})

hooks.name.tap('tapname1', (name) => {
	console.log(121, name);
	return name;
})

hooks.name.tap({ name: 'tapname2', before: ['tapname', 'tapname1'] }, (name) => {
	console.log(112, name);
	return name;
})

hooks.info.tap('tapinfo', (info) => {
	console.log(222, info);
})

console.log(123, hooks);

hooks.name.call('andy');

// const hook = new SyncHook(["arg1", "arg2", "arg3"]);


// console.log(111, hook);

// function X() {
// 	const x = {};
// 	x.constructor = X;
// 	return x;
// }
//
// X.prototype = null;
//
// const xx = new X();
//
// console.log(123, xx);
