const { SyncWaterfallHook } = require('tapable');

const hooks = new SyncWaterfallHook(['name'], 'syncName');

hooks.tap('name_1', (name) => {
	console.log(111, name);
	return name;
})

hooks.tap({ name: 'name_2' }, (name) => {
	console.log(222, name);
	return name;
})

hooks.tap({ name: 'name_3' }, (name) => {
	console.log(333, name);
	return name;
})

hooks.call('andy');
