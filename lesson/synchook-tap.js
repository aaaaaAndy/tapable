const { SyncHook } = require('tapable');

const hooks = new SyncHook(['name'], 'syncName');

hooks.tap('name_1', (name) => {
	console.log(111, name);
})

hooks.tap({ name: 'name_2' }, (name) => {
	console.log(222, name);
})

hooks.tap({ name: 'name_3', before: 'name_2' }, (name) => {
	console.log(333, name);
})

hooks.tap({ name: 'name_4', stage: -1 }, (name) => {
	console.log(444, name);
})

console.log(hooks);
