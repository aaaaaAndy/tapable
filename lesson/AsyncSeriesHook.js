const { AsyncSeriesHook, SyncHook, AsyncHook } = require('tapable');

console.log(111, )
const compile = new AsyncHook();

console.log(123, compile);
