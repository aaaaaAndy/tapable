

`tapable`是一个类似`EventEmitter`的库，它是`webpack`插件化的基石，也是一个很有名的用来做插件化的`js`库。今天就来简单看看其源码。

如上文档所说，`tapable`导出了很多实现插件化的`Hooks`:

```javascript
const {
	SyncHook,
	SyncBailHook,
	SyncWaterfallHook,
	SyncLoopHook,
	AsyncParallelHook,
	AsyncParallelBailHook,
	AsyncSeriesHook,
	AsyncSeriesBailHook,
	AsyncSeriesWaterfallHook
 } = require("tapable");
```

在众多缭乱的`Hooks`中，我们先从最简单的`SyncHook`来解读：

## 1. 准备工作

阅读源码前肯定要首先把[官方源码](https://github.com/webpack/tapable)下载下来，当然也可以下载我仓库里的源码，如果下载[我的源码](https://github.com/aaaaaAndy/tapable)你会发现我在源码（分支:study-master）里写了很多注释，这会对第一次阅读源码的人很有帮助。

我阅读的源码是`2.2.0`版本的，这一版本的源码有点小问题，就是这一版本的源码在`node`环境下运行报错。这就很尴尬了。所以这也就是我为什么要写“准备工作”的原因了。

在`synchook.js`文件中我写了一个简单的用法：

```javascript
const { SyncHook } = require('tapable');

const hooks = new SyncHook(['name']);

hooks.tap('name_tap', (name) => {
	console.log(name);
})

hooks.call('andy');
```

如果执行`node synchook.js`可能会报错，如下：

<img src="https://raw.githubusercontent.com/aaaaaAndy/picture/main/images/20210402160253.png" alt="image-20210402160122027" style="width: 100%;" />

如果遇到了这种报错，先不要着急，这不是你代码写错了，而很有可能是`node`的一个`bug`，因为在`SyncHook`的源码里有这么一句：`SyncHook.prototype = null`，只需要把这句注释掉就不会报错了，其他的`AsyncSeriesHook`，`SyncWaterfallHook`等也是这个原因。如下图所示

```javascript
function SyncHook(args = [], name = undefined) {
	const hook = new Hook(args, name);
	hook.constructor = SyncHook;
	hook.tapAsync = TAP_ASYNC;
	hook.tapPromise = TAP_PROMISE;
	hook.compile = COMPILE;
	return hook;
}

// 注释掉下面一行
// SyncHook.prototype = null;

module.exports = SyncHook;
```

## 2. `SyncHook`

`SyncHook.js`的源码如下：

```javascript
const Hook = require("./Hook");
const HookCodeFactory = require("./HookCodeFactory");

class SyncHookCodeFactory extends HookCodeFactory {
	content({ onError, onDone, rethrowIfPossible }) {
		return this.callTapsSeries({
			onError: (i, err) => onError(err),
			onDone,
			rethrowIfPossible
		});
	}
}

const factory = new SyncHookCodeFactory();

// 如果调用就报错
const TAP_ASYNC = () => {
	throw new Error("tapAsync is not supported on a SyncHook");
};

// 如果调用就报错
const TAP_PROMISE = () => {
	throw new Error("tapPromise is not supported on a SyncHook");
};

const COMPILE = function(options) {
	factory.setup(this, options);
	return factory.create(options);
};

function SyncHook(args = [], name = undefined) {
  // 继承Hook的方法
	const hook = new Hook(args, name);
	hook.constructor = SyncHook;
	hook.tapAsync = TAP_ASYNC;
	hook.tapPromise = TAP_PROMISE;
	hook.compile = COMPILE;
	return hook;
}

// SyncHook.prototype = null;

module.exports = SyncHook;
```

可以看到构造函数`SyncHook`返回的是一个对象`hook`，如果`JavaScript`基础还可以的同学应该记得，构造函数不止可以返回`this`，还可以返回一个对象。这里就属于后者，而且属于`JS`设计模式中工厂模式的一种。

对于`SyncHook`常用的方法`tap`，`call`等在这里看不到，这是因为它继承自`Hook`构造函数。并且这里针对`tapAsync`，`tapPromise`等只有异步才会用到的方法采用了报错处理，在这里是不能调用的，如果调用就会抛出相应的错误。

`compile`方法属于`call`方法的下游，当调用`hook.call()`方法时其实最终会调用`hook.compile()`方法。那么为什么`compile`方法要在`SyncHook.js`文件这里单独定义？这是因为不同的`hooks`最终的执行顺序会稍有不同，所以要在每个`hooks`的文件里单独定义，比如`SyncHooks.js`第6行左右的`this.callTapsSeries()`表明这里是按先后顺序执行。

## 3. `tap`

在`tapable`中，所有的同步的，异步的`hooks`都继承自`Hook`构造函数。

### 3.1 `Hook`属性

```javascript
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
}
```

可以看到，`Hook`的属性都在其`constructor`中定义了，其中比较重要的就是`this.taps`了，它主要保存当前`hook`的所有订阅者（我把`tapable`这种工作模式归类为***发布订阅者模式***）。其实每个都很重要，因为缺少任何一段代码都会报错的。O(∩_∩)O哈哈

由`constructor`中的代码可以看到`tap`事件和`call`事件是成双入对的，这里就以`this.tap`和`this.call`这条线继续阅读源码。

### 3.2 `tap`方法

```javascript
class Hook {
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
}
```

可以看到`this.tap`,`this.tapAsync`,`this.tapPromise` 最终调用的都是`this._tap`方法。只是传入的第一个参数`type`不一样。在这里不得不佩服作者的代码规范了，针对`class`的私有属性用`_`开头。

具体每段代码的含义这里就不再赘述，因为上面的代码里已经加了。这里着重看后三行代码。首先把`type`,`fn`和`options`合并为一个新的`options`。然后运行一些拦截器，最后插入订阅者函数。

### 3.3 拦截器

```javascript
class Hook {
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
}
```

拦截器的代码很简单，可以理解为每个拦截器都是一个函数，把`options`传入每个拦截器中执行一遍，最后返回一个新的`options`，在平常的业务中其实很少用到拦截器，毕竟这是比较高级的用法，所以这里一般不会进入到`for`循环里，导致这就是一个吃干饭的函数，接收`options`，再返回同一个`options`。

### 3.4 `_insert`插入

```javascript
class Hook {
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
```

由此可以知道，`options`参数可以传入`before`和`stage`属性，在`while`循环之前都是对这两个参数的校验，转换。在`while`循环里，大致思想是从后往前查找，一个条件是通过`before`查找需要在哪个消费者之前，一个是根据`stage`比较权重。当最后找到位置之后就`break`,最后一行`this.taps[i] = item`进行插入，这里就是数组的简单操作。

至此，`this.tap`的所有操作就完成了。

### 3.5 插入示例

当执行下面一段代码插入订阅者时：

```javascript
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
```

最终得到的`hooks`如下：

![image-20210402171152271](https://raw.githubusercontent.com/aaaaaAndy/picture/main/images/20210402171152.png)

## 4. `call`

`tapable`最终通过调用`call`方法来给订阅者发布消息。

### 4.1 `call`方法

在第3段中我们有说道，`cap`和`call`都是继承自`Hook`构造函数：

```javascript
const CALL_DELEGATE = function(...args) {
	this.call = this._createCall("sync");
	return this.call(...args);
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
    // hook.call最终调用的这里
		this.call = CALL_DELEGATE;

		this.compile = this.compile;
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
}
```

可以看到，当我们调用`hook.call`方法时，兜兜转转最终还是调用了`SyncHook`构造函数中重写的`compile`函数。

### 4.2 `compile`方法

```javascript
const Hook = require("./Hook");
const HookCodeFactory = require("./HookCodeFactory");

class SyncHookCodeFactory extends HookCodeFactory {
	content({ onError, onDone, rethrowIfPossible }) {
		return this.callTapsSeries({
			onError: (i, err) => onError(err),
			onDone,
			rethrowIfPossible
		});
	}
}

const factory = new SyncHookCodeFactory();

// 这个函数是重点，执行call事件的时候回执行这个函数
const COMPILE = function(options) {
	factory.setup(this, options);
	return factory.create(options);
};

function SyncHook(args = [], name = undefined) {
	const hook = new Hook(args, name);
	hook.compile = COMPILE;
	return hook;
}

module.exports = SyncHook;
```

由此可以看到，重写的`compile`函数还是比较复杂的。其中`factory`是`SyncHookCodeFactory`的实例，而`SyncHookCodeFactory`继承自`HookCodeFactory`，所以`factory`就可以直接调用`HookCodeFactory`中的`setup`和`create`方法：

### 4.3 `setup`方法

```javascript
class HookCodeFactory {
  setup(instance, options) {
		instance._x = options.taps.map(t => t.fn);
	}
}
```

可以看到`factory.setup(this, options);` 其实是把`options`里的订阅者函数提取出来挂载到`hook._x`上。

### 4.4 `create`方法

```javascript
class HookCodeFactory {
  constructor(config) {
		this.config = config;
		this.options = undefined;
		this._args = undefined;
	}

  init(options) {
		this.options = options;
		this._args = options.args.slice();
	}

	deinit() {
		this.options = undefined;
		this._args = undefined;
	}
  
  // 根据options生成一段可以执行函数fn
  create(options) {
    // 设置options和_args
		this.init(options);
    
		let fn;
		switch (this.options.type) {
			case "sync":
				fn = new Function(
					this.args(),
					'"use strict";\n' +
						this.header() +
						this.contentWithInterceptors({
							onError: err => `throw ${err};\n`,
							onResult: result => `return ${result};\n`,
							resultReturns: true,
							onDone: () => "",
							rethrowIfPossible: true
						})
				);
				break;
			case "async":
				fn = new Function(
					this.args({
						after: "_callback"
					}),
					'"use strict";\n' +
						this.header() +
						this.contentWithInterceptors({
							onError: err => `_callback(${err});\n`,
							onResult: result => `_callback(null, ${result});\n`,
							onDone: () => "_callback();\n"
						})
				);
				break;
			case "promise":
				let errorHelperUsed = false;
				const content = this.contentWithInterceptors({
					onError: err => {
						errorHelperUsed = true;
						return `_error(${err});\n`;
					},
					onResult: result => `_resolve(${result});\n`,
					onDone: () => "_resolve();\n"
				});
				let code = "";
				code += '"use strict";\n';
				code += this.header();
				code += "return new Promise((function(_resolve, _reject) {\n";
				if (errorHelperUsed) {
					code += "var _sync = true;\n";
					code += "function _error(_err) {\n";
					code += "if(_sync)\n";
					code +=
						"_resolve(Promise.resolve().then((function() { throw _err; })));\n";
					code += "else\n";
					code += "_reject(_err);\n";
					code += "};\n";
				}
				code += content;
				if (errorHelperUsed) {
					code += "_sync = false;\n";
				}
				code += "}));\n";
				fn = new Function(this.args(), code);
				break;
		}
		this.deinit();
		return fn;
	}
}
```

源码读到此处基本就没有再读下去的必要了，因为`create`函数的功能只是根据`options`来生成不同的代码片段，也就是说`sync`和`async`生成的代码片段是不同的，最后返回这个代码片段，执行他们就可以了。

### 4.5 `call`示例

#### 4.5.1 `SyncHook`示例

逻辑代码如下：

```javascript
const { SyncHook } = require('tapable');

const hooks = new SyncHook(['name'], 'syncName');

hooks.tap('name_1', (name) => {
	console.log(111, name);
})

hooks.tap({ name: 'name_2' }, (name) => {
	console.log(222, name);
})

hooks.tap({ name: 'name_3' }, (name) => {
	console.log(333, name);
})

hooks.call('andy');
```

`debug`后最终生成代码`fn`如下：

```javascript
(function anonymous(name
) {
"use strict";
var _context;
var _x = this._x;
var _fn0 = _x[0];
_fn0(name);
var _fn1 = _x[1];
_fn1(name);
var _fn2 = _x[2];
_fn2(name);

})
```

由以上代码可以很简单看清逻辑，传入参数`name`,从`this._x`上依次取出三个消费者函数并执行。

#### 4.5.2 `SyncWaterfallHook`示例

逻辑代码如下：

```javascript
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
```

`debug`后最终生成代码`fn`如下：

```javascript
(function anonymous(name
) {
"use strict";
var _context;
var _x = this._x;
var _fn0 = _x[0];
var _result0 = _fn0(name);
if(_result0 !== undefined) {
name = _result0;
}
var _fn1 = _x[1];
var _result1 = _fn1(name);
if(_result1 !== undefined) {
name = _result1;
}
var _fn2 = _x[2];
var _result2 = _fn2(name);
if(_result2 !== undefined) {
name = _result2;
}
return name;

})
```

可以很清楚看到逻辑，每次执行的结果作为下一个订阅者函数的参数传入。