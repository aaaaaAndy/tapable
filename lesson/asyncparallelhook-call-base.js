const { AsyncSeriesHook } = require('tapable');

const hooks = new AsyncSeriesHook(['name'], 'syncName');

hooks.tapAsync('name_1', (name) => {
	console.log(111, name);
})

hooks.tapAsync({ name: 'name_2' }, (name) => {
	console.log(222, name);
})

hooks.tapAsync({ name: 'name_3' }, (name) => {
	console.log(333, name);
})

hooks.callAsync('andy');

// (function anonymous(name, _callback
// ) {
// 	"use strict";
// 	var _context;
// 	var _x = this._x;
// 	function _next1() {
// 		var _fn2 = _x[2];
// 		_fn2(name, (function(_err2) {
// 			if(_err2) {
// 				_callback(_err2);
// 			} else {
// 				_callback();
// 			}
// 		}));
// 	}
// 	function _next0() {
// 		var _fn1 = _x[1];
// 		_fn1(name, (function(_err1) {
// 			if(_err1) {
// 				_callback(_err1);
// 			} else {
// 				_next1();
// 			}
// 		}));
// 	}
// 	var _fn0 = _x[0];
// 	_fn0(name, (function(_err0) {
// 		if(_err0) {
// 			_callback(_err0);
// 		} else {
// 			_next0();
// 		}
// 	}));
//
// })
