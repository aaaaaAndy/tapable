/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/
"use strict";

const util = require("util");

const deprecateContext = util.deprecate(() => {},
"Hook.context is deprecated and will be removed");

const CALL_DELEGATE = function(...args) {
	this.call = this._createCall("sync");
	return this.call(...args);
};
const CALL_ASYNC_DELEGATE = function(...args) {
	this.callAsync = this._createCall("async");
	return this.callAsync(...args);
};
const PROMISE_DELEGATE = function(...args) {
	this.promise = this._createCall("promise");
	return this.promise(...args);
};

class Hook {
	constructor(args = [], name = undefined) {
		// 当前hook的参数
		this._args = args;
		// 当前hook的name
		this.name = name;
		// 当前hook的所有消费者
		this.taps = [];
		// 当前hook的拦截器
		this.interceptors = [];
		this._call = CALL_DELEGATE;
		this.call = CALL_DELEGATE;
		this._callAsync = CALL_ASYNC_DELEGATE;
		this.callAsync = CALL_ASYNC_DELEGATE;
		this._promise = PROMISE_DELEGATE;
		this.promise = PROMISE_DELEGATE;
		this._x = undefined;

		this.compile = this.compile;
		this.tap = this.tap;
		this.tapAsync = this.tapAsync;
		this.tapPromise = this.tapPromise;
	}

	// 需要重写这个方法
	compile(options) {
		throw new Error("Abstract: should be overridden");
	}

	// 创建一个生产者
	_createCall(type) {
		return this.compile({
			taps: this.taps,
			interceptors: this.interceptors,
			args: this._args,
			type: type
		});
	}

	/**
	 * 设置消费者
	 * @param {string} type = sync|async|promise tapable内部函数tap|tapAsync|tapPromise传入的
	 * @param {string|object} options 用户调用tap|tapAsync|tapPromise函数传入的第一个参数，为配置项
	 * @param {function} fn 消费者函数
	 * @private
	 */
	_tap(type, options, fn) {
		// options为string类型时是为name
		// options为对象时不做处理
		if (typeof options === "string") {
			options = {
				name: options.trim()
			};
		} else if (typeof options !== "object" || options === null) {
			throw new Error("Invalid tap options");
		}

		// 新一轮判断，必须存在options.name
		if (typeof options.name !== "string" || options.name === "") {
			throw new Error("Missing name for tap");
		}

		// options.context是一个不推荐使用的属性
		if (typeof options.context !== "undefined") {
			deprecateContext();
		}

		// 合并type，fn，和options
		options = Object.assign({ type, fn }, options);
		// 运行拦截器
		options = this._runRegisterInterceptors(options);
		// 插入消费者函数
		this._insert(options);
	}

	tap(options, fn) {
		this._tap("sync", options, fn);
	}

	tapAsync(options, fn) {
		this._tap("async", options, fn);
	}

	tapPromise(options, fn) {
		this._tap("promise", options, fn);
	}

	/**
	 * 运行拦截器，找到当前hooks的所有拦截器，把所有的options过一下拦截器生成新的options
	 * @param {object} options this.tap传入的第一个参数
	 * @returns {object} 一个新的options,当然也可能是老的
	 */
	_runRegisterInterceptors(options) {
		for (const interceptor of this.interceptors) {
			if (interceptor.register) {
				const newOptions = interceptor.register(options);
				if (newOptions !== undefined) {
					options = newOptions;
				}
			}
		}
		return options;
	}

	withOptions(options) {
		const mergeOptions = opt =>
			Object.assign({}, options, typeof opt === "string" ? { name: opt } : opt);

		return {
			name: this.name,
			tap: (opt, fn) => this.tap(mergeOptions(opt), fn),
			tapAsync: (opt, fn) => this.tapAsync(mergeOptions(opt), fn),
			tapPromise: (opt, fn) => this.tapPromise(mergeOptions(opt), fn),
			intercept: interceptor => this.intercept(interceptor),
			isUsed: () => this.isUsed(),
			withOptions: opt => this.withOptions(mergeOptions(opt))
		};
	}

	// 判断当前的hooks是否有在使用
	// 有在使用的条件是有消费者或者有拦截器
	isUsed() {
		return this.taps.length > 0 || this.interceptors.length > 0;
	}

	/**
	 * 插入拦截器
	 * @param {object} interceptor 拦截器
	 * @param {function} interceptor.register 拦截器函数
	 */
	intercept(interceptor) {
		this._resetCompilation();
		// 插入拦截器函数
		this.interceptors.push(Object.assign({}, interceptor));
		// 每有一个新的拦截器插入就需要把所有的taps消费者过一下拦截器
		if (interceptor.register) {
			for (let i = 0; i < this.taps.length; i++) {
				this.taps[i] = interceptor.register(this.taps[i]);
			}
		}
	}

	/**
	 * 重置一个编译动作
	 * @private
	 */
	_resetCompilation() {
		this.call = this._call;
		this.callAsync = this._callAsync;
		this.promise = this._promise;
	}

	/**
	 * 插入消费者
	 * @param {object} item 消费者属性合集
	 * @param {string} item.type 消费者类型:sync|async|promise
	 * @param {string} item.name 消费者名称，只是为了区分不同的消费者而已
	 * @param {function} item.fn 具体消费者函数
	 * @param {number} item.stage 当前消费者权重
	 * @param {string|string[]} item.before 当前消费者应该处于哪个或者哪些消费者之前
	 * @private
	 */
	_insert(item) {
		this._resetCompilation();

		// 处于哪个消费者之前
		// before可以是一个字符串，也可以是一个字符串数组，
		// 当其是一个字符串数组时表明当前消费者处于before里定义的所有消费者之前
		let before;
		if (typeof item.before === "string") {
			before = new Set([item.before]);
		} else if (Array.isArray(item.before)) {
			before = new Set(item.before);
		}

		// 权重，默认为0，权重越小越靠前
		let stage = 0;
		if (typeof item.stage === "number") {
			stage = item.stage;
		}

		let i = this.taps.length;
		while (i > 0) {
			// 这里是从数据末尾每次往后复制一个
			i--;
			const x = this.taps[i];
			this.taps[i + 1] = x;
			const xStage = x.stage || 0;

			// 当options.before存在时
			// 此时需要根据消费者name判断新进的消费者需要插入哪个消费者之前
			if (before) {
				// 如果已经找到了位置，则删除before
				if (before.has(x.name)) {
					before.delete(x.name);
					continue;
				}
				// 如果上一步没有找到，那么before.size是大于0的，此时不能插入，还需要继续往前找
				if (before.size > 0) {
					continue;
				}
			}
			// 比较权重
			if (xStage > stage) {
				continue;
			}
			i++;
			break;
		}
		this.taps[i] = item;
	}
}

Object.setPrototypeOf(Hook.prototype, null);

module.exports = Hook;
