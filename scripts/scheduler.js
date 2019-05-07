"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = require("events");
const list_1 = require("./list");
var TaskStatus;
(function (TaskStatus) {
    TaskStatus[TaskStatus["pending"] = 0] = "pending";
    TaskStatus[TaskStatus["running"] = 1] = "running";
    TaskStatus[TaskStatus["done"] = 2] = "done";
    TaskStatus[TaskStatus["failed"] = 3] = "failed";
})(TaskStatus = exports.TaskStatus || (exports.TaskStatus = {}));
class Scheduler extends events_1.EventEmitter {
    constructor(options = {}) {
        super();
        this.pendingTasks = new list_1.LinkedList();
        this.runningTasks = new list_1.LinkedList();
        this.destructOptions(options);
    }
    dispatch() {
        return __awaiter(this, void 0, void 0, function* () {
            this.schedule();
            while (!this.runningTasks.empty()) {
                this.runningTasks.forEach(node => node.value.status < TaskStatus.running && this.runTask(node.value));
                yield new Promise((resolve) => {
                    this.once('dispatch', resolve);
                });
            }
        });
    }
    push(...args) {
        const newTask = this.newTask(...args);
        this.pendingTasks.push(newTask);
        return this;
    }
    asyncPush(...args) {
        return __awaiter(this, void 0, void 0, function* () {
            const newTask = yield this.newTask(...args);
            this.pendingTasks.push(newTask);
            return this;
        });
    }
    destroy() {
        this.pendingTasks.destroy();
    }
    schedule(offset = 0) {
        this.runningTasks.forEach(node => node.value.status > TaskStatus.running && node.delete());
        const todoTasks = this.pendingTasks.splice(offset, this.parallelSize - this.runningTasks.length);
        todoTasks.forEach(node => this.runningTasks.push(node.value));
    }
    runTask(task) {
        return __awaiter(this, void 0, void 0, function* () {
            task.status = TaskStatus.running;
            try {
                const result = yield task.do();
                task.status = TaskStatus.done;
                yield this.onDone(result, task);
            }
            catch (error) {
                task.error = error;
                task.status = TaskStatus.failed;
                yield this.onError(error, task);
            }
            this.schedule();
            this.emit('dispatch');
        });
    }
    newTask(...args) {
        return {
            status: TaskStatus.pending,
            do: () => new Promise(() => { }),
        };
    }
    onDone(result, task) {
        ;
    }
    onError(error, task) {
        ;
    }
    destructOptions(options) {
        ;
        ({
            parallelSize: this.parallelSize = 5,
            onDone: this.onDone = this.onDone,
            onError: this.onError = this.onError,
            newTask: this.newTask = this.newTask,
        } = options);
    }
}
exports.default = Scheduler;
if (require.main === module) {
    !function () {
        return __awaiter(this, void 0, void 0, function* () {
            const schd = new Scheduler({
                parallelSize: 3,
                newTask(n) {
                    return __awaiter(this, void 0, void 0, function* () {
                        return {
                            status: TaskStatus.pending,
                            do: () => __awaiter(this, void 0, void 0, function* () { return yield n; }),
                        };
                    });
                },
                onDone(n, task) {
                    return __awaiter(this, void 0, void 0, function* () {
                        console.log(n);
                        // console.log('pending length: ', schd.pendingTasks.length)
                        // console.log('running length: ', schd.runningTasks.length)
                        console.log('pending: ', schd.pendingTasks.map(node => node.value.status.toString()).toArray().join(', '));
                        console.log('running: ', schd.runningTasks.map(node => node.value.status.toString()).toArray().join(', '));
                        // console.log('\n');
                        // await schd.asyncPush(n + 5);
                        // await new Promise(r => {
                        //     setTimeout(() => {
                        //         r();
                        //     }, 1000);
                        // })
                        schd.destroy();
                    });
                },
                onError(e) {
                    return __awaiter(this, void 0, void 0, function* () {
                        console.log(e);
                    });
                }
            });
            yield Promise.all(Array(5).fill(0).map((_, k) => __awaiter(this, void 0, void 0, function* () {
                return yield schd.asyncPush(k);
            })));
            yield schd.dispatch();
            console.log('all done');
        });
    }();
}
