# Tapable

本文档是基于`tapable v2.2.0`版本！

`tapable`是一个用来做插件化的库，它暴露了很多`Hook`类（构造函数），可以用来创建不同的`hooks`。

`tapable`整体是一个发布订阅模式，由调度中心统一处理。

``` javascript
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

## 1. 安装

-   `npm`方式

``` shell
npm install --save tapable
```

-   `yarn`方式

```shell
yarn add tapable
```

## 2. 使用

`hook`其实可以被翻译为钩子，但是这里不建议直接翻译，还是采用`hook`的方式描述更为形象。

所有的`Hook`构造函数都提供了一种可选的参数，它们将作为订阅者被调用时传入的参数名。事实上，从`v2.0.0`版本开始，在构造函数里又加入了一个可选参数`name`，用来标识当前`hook`的名字。

``` js
const hook = new SyncHook(["arg1", "arg2", "arg3"], 'name1');
```

使用`hooks`最好的方式是将它们都封装在同一个类或对象中。

``` js
class Car {
	constructor() {
		this.hooks = {
			accelerate: new SyncHook(["newSpeed"]),
			brake: new SyncHook(),
			calculateRoutes: new AsyncParallelHook(["source", "target", "routesList"])
		};
	}

	/* ... */
}
```

当你把所有的`hooks`封装在一个类中时，你就可以像下面这样使用它们：

``` js
const myCar = new Car();

// Use the tap method to add a consument
myCar.hooks.brake.tap("WarningLampPlugin", () => warningLamp.on());
```

在`v2.0.0`版本中，添加订阅者时又新增了两个可选参数：

-   `before`：定义需要添加在哪个订阅者之前；
-   `stage`：当天订阅者权重，默认为0，权重越小越靠前；

具体示例可查看[before,stage示例](https://aaaaaandy.github.io/tapable/#/source?id=_35-%e6%8f%92%e5%85%a5%e7%a4%ba%e4%be%8b)

```javascript
myCar.hooks.brake.tap('name_1', (name) => {})

myCar.hooks.brake.tap({ name: 'name_2' }, (name) => {})

myCar.hooks.brake.tap({ name: 'name_3', before: 'name_2' }, (name) => {})

myCar.hooks.brake.tap({ name: 'name_4', stage: -1 }, (name) => {})
```

当你需要订阅时，你需要传入一个`name`去标识当前订阅者的名字。

在具体的订阅者函数中，你可以像下面这样接收参数。

``` js
myCar.hooks.accelerate.tap("LoggerPlugin", newSpeed => console.log(`Accelerating to ${newSpeed}`));
```

同步`hooks`，只能用`tap`同步方法添加订阅者；异步`hooks`除了可以用`tap`同步方法，也可以用`tapAsync`、`tapPromise`等异步方法添加订阅者。

``` js
myCar.hooks.calculateRoutes.tapPromise("GoogleMapsPlugin", (source, target, routesList) => {
	// return a promise
	return google.maps.findRoute(source, target).then(route => {
		routesList.add(route);
	});
});

myCar.hooks.calculateRoutes.tapAsync("BingMapsPlugin", (source, target, routesList, callback) => {
	bing.findRoute(source, target, (err, route) => {
		if(err) return callback(err);
		routesList.add(route);
		// call the callback
		callback();
	});
});

// You can still use sync plugins
myCar.hooks.calculateRoutes.tap("CachedRoutesPlugin", (source, target, routesList) => {
	const cachedRoute = cache.get(source, target);
	if(cachedRoute)
		routesList.add(cachedRoute);
})
```
可以采用如下的方式去调用这些订阅者：

``` js
class Car {
	/**
	  * You won't get returned value from SyncHook or AsyncParallelHook,
	  * to do that, use SyncWaterfallHook and AsyncSeriesWaterfallHook respectively
	 **/

	setSpeed(newSpeed) {
		// following call returns undefined even when you returned values
		this.hooks.accelerate.call(newSpeed);
	}

	useNavigationSystemPromise(source, target) {
		const routesList = new List();
		return this.hooks.calculateRoutes.promise(source, target, routesList).then((res) => {
			// res is undefined for AsyncParallelHook
			return routesList.getRoutes();
		});
	}

	useNavigationSystemAsync(source, target, callback) {
		const routesList = new List();
		this.hooks.calculateRoutes.callAsync(source, target, routesList, err => {
			if(err) return callback(err);
			callback(null, routesList.getRoutes());
		});
	}
}
```

The Hook will compile a method with the most efficient way of running your plugins. It generates code depending on:
* The number of registered plugins (none, one, many)
* The kind of registered plugins (sync, async, promise)
* The used call method (sync, async, promise)
* The number of arguments
* Whether interception is used

This ensures fastest possible execution.

## 3. Hook 类型

可以用一个或多个方法添加订阅者，但是他们具体怎么执行还是要依赖`hook`的类型。

* `Basic hook` ：(without “Waterfall”, “Bail” or “Loop” in its name). 这个`hook`只会按顺序简单调用所有订阅者；

* `Waterfall`： 以瀑布流的模式，按顺序触发每一个订阅者，但是会把上一个订阅者的返回结果作为下一个订阅者的参数传入；

* `Bail`：类似于`promise.race()`，只要有任何一个订阅者有返回内容，就暂停执行剩余的订阅者，并整体退出；

* `Loop`. 一个可以循环执行的`hook`，当任何一个订阅者返回不为`undefined`时，就返回第一个订阅者，重新执行。只有当所有的订阅者都返回`undefined`时才会执行完毕。

钩子可以是同步的,也可以是异步的,`Sync`, `AsyncSeries` 和 `AsyncParallel` 钩子就反应了这个问题

* __Sync__. 一个同步`hook`只能用同步的方法(`tap`)添加订阅者；
* __AsyncSeries__. 一个`async-series`的`hook`可以用同步方法、基于回调的方法、基于`promise`的方法添加订阅者，(使用 `myHook.tap()`, `myHook.tapAsync()` and `myHook.tapPromise()`). 它会按照顺序调用每个订阅者；

* __AsyncParallel__. 一个`async-parallel`的`hook`与上面`async-series`一样采用同步方法、基于回调的方法、基于`promise`的方法添加订阅者，不同的是，它会同步执行所有的订阅者，并不会按熟悉怒执行。


## 4. Interception

所有`Hooks`都提供了拦截器`API`：

``` js
myCar.hooks.calculateRoutes.intercept({
	call: (source, target, routesList) => {
		console.log("Starting to calculate routes");
	},
	register: (tapInfo) => {
		// tapInfo = { type: "promise", name: "GoogleMapsPlugin", fn: ... }
		console.log(`${tapInfo.name} is doing its job`);
		return tapInfo; // may return a new tapInfo object
	}
})
```

**call**: `(...args) => void` Adding `call` to your interceptor will trigger when hooks are triggered. You have access to the hooks arguments.

**tap**: `(tap: Tap) => void` Adding `tap` to your interceptor will trigger when a plugin taps into a hook. Provided is the `Tap` object. `Tap` object can't be changed.

**loop**: `(...args) => void` Adding `loop` to your interceptor will trigger for each loop of a looping hook.

**register**: `(tap: Tap) => Tap | undefined` Adding `register` to your interceptor will trigger for each added `Tap` and allows to modify it.

## 5. Context

Plugins and interceptors can opt-in to access an optional `context` object, which can be used to pass arbitrary values to subsequent plugins and interceptors.

``` js
myCar.hooks.accelerate.intercept({
	context: true,
	tap: (context, tapInfo) => {
		// tapInfo = { type: "sync", name: "NoisePlugin", fn: ... }
		console.log(`${tapInfo.name} is doing it's job`);

		// `context` starts as an empty object if at least one plugin uses `context: true`.
		// If no plugins use `context: true`, then `context` is undefined.
		if (context) {
			// Arbitrary properties can be added to `context`, which plugins can then access.
			context.hasMuffler = true;
		}
	}
});

myCar.hooks.accelerate.tap({
	name: "NoisePlugin",
	context: true
}, (context, newSpeed) => {
	if (context && context.hasMuffler) {
		console.log("Silence...");
	} else {
		console.log("Vroom!");
	}
});
```

## 6. HookMap

A HookMap is a helper class for a Map with Hooks

``` js
const keyedHook = new HookMap(key => new SyncHook(["arg"]))
```

``` js
keyedHook.for("some-key").tap("MyPlugin", (arg) => { /* ... */ });
keyedHook.for("some-key").tapAsync("MyPlugin", (arg, callback) => { /* ... */ });
keyedHook.for("some-key").tapPromise("MyPlugin", (arg) => { /* ... */ });
```

``` js
const hook = keyedHook.get("some-key");
if(hook !== undefined) {
	hook.callAsync("arg", err => { /* ... */ });
}
```

## 7. Hook/HookMap interface

Public:

``` ts
interface Hook {
	tap: (name: string | Tap, fn: (context?, ...args) => Result) => void,
	tapAsync: (name: string | Tap, fn: (context?, ...args, callback: (err, result: Result) => void) => void) => void,
	tapPromise: (name: string | Tap, fn: (context?, ...args) => Promise<Result>) => void,
	intercept: (interceptor: HookInterceptor) => void
}

interface HookInterceptor {
	call: (context?, ...args) => void,
	loop: (context?, ...args) => void,
	tap: (context?, tap: Tap) => void,
	register: (tap: Tap) => Tap,
	context: boolean
}

interface HookMap {
	for: (key: any) => Hook,
	intercept: (interceptor: HookMapInterceptor) => void
}

interface HookMapInterceptor {
	factory: (key: any, hook: Hook) => Hook
}

interface Tap {
	name: string,
	type: string
	fn: Function,
	stage: number,
	context: boolean,
	before?: string | Array
}
```

Protected (only for the class containing the hook):

``` ts
interface Hook {
	isUsed: () => boolean,
	call: (...args) => Result,
	promise: (...args) => Promise<Result>,
	callAsync: (...args, callback: (err, result: Result) => void) => void,
}

interface HookMap {
	get: (key: any) => Hook | undefined,
	for: (key: any) => Hook
}
```

## 8. MultiHook

A helper Hook-like class to redirect taps to multiple other hooks:

``` js
const { MultiHook } = require("tapable");

this.hooks.allHooks = new MultiHook([this.hooks.hookA, this.hooks.hookB]);
```
