"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const util_1 = require("util");
class Node {
    constructor(list) {
        this._belonging = list;
    }
    delete() {
        const belonging = this._belonging;
        if (!belonging) {
            throw new Error(`node already deleted`);
        }
        this.prev ? (this.prev.next = this.next) : (belonging._head = belonging._head.next);
        this.next ? (this.next.prev = this.prev) : (belonging._tail = belonging._tail.prev);
        this._value = undefined;
        this.next = undefined;
        this.prev = undefined;
        this._belonging = undefined;
        belonging._length--;
        return belonging;
    }
    get value() {
        return this._value;
    }
    set value(value) {
        this._value = value;
    }
    toString() {
        const value = this.value || 'undefined';
        return value.toString && value.toString() || JSON.stringify(value);
    }
    [util_1.inspect.custom]() {
        return this.toString();
    }
}
class LinkedList {
    constructor() {
        this._length = 0;
    }
    static fromArray(from) {
        const linkedList = new LinkedList();
        from.forEach(v => linkedList.push(v));
        return linkedList;
    }
    empty() {
        return !this._length;
    }
    push(value) {
        const node = new Node(this);
        node.value = value;
        node.prev = this._tail;
        this._tail = this._tail && (this._tail.next = node) || (this._head = node);
        this._length++;
        return this;
    }
    unshift(value) {
        const node = new Node(this);
        node.value = value;
        node.next = this._head;
        this._head = this._head && (this._head.prev = node) || (this._tail = node);
        this._length++;
        return this;
    }
    forEach(callback) {
        let cursor = this.head;
        while (cursor) {
            const next = cursor.next;
            callback(cursor);
            cursor = next;
        }
        return this;
    }
    map(callback) {
        const mapping = new LinkedList();
        let cursor = this.head;
        while (cursor) {
            const next = cursor.next;
            mapping.push(callback(cursor));
            cursor = next;
        }
        return mapping;
    }
    splice(start, deleteCount) {
        const linkedList = new LinkedList();
        let cursor = this.head;
        while (start-- && cursor) {
            cursor = cursor.next;
        }
        while (deleteCount-- && cursor) {
            const next = cursor.next;
            linkedList.push(cursor.value);
            cursor.delete();
            cursor = next;
        }
        return linkedList;
    }
    destroy() {
        while (this.head) {
            this.head.delete();
        }
        ;
    }
    get length() {
        return this._length;
    }
    get head() {
        return this._head;
    }
    get tail() {
        return this._tail;
    }
    toArray() {
        const array = [];
        this.forEach(v => v.value && array.push(v.value));
        return array;
    }
    toString() {
        let cursor = this.head;
        let nodes = [];
        while (cursor) {
            nodes.push(cursor);
            cursor = cursor.next;
        }
        return `[ ${nodes.map(node => node.toString()).join(' ')} ]`;
    }
    [util_1.inspect.custom]() {
        return this.toString();
    }
}
exports.LinkedList = LinkedList;
if (require.main === module) {
    let linkedList = new LinkedList();
    console.log(linkedList.empty());
    console.log(linkedList.head, linkedList.tail);
    console.log(linkedList.length);
    console.log('#########################################');
    linkedList.push(1);
    console.log(linkedList.empty());
    console.log(linkedList.head, linkedList.head.next, '*', linkedList.tail);
    console.log(linkedList.length);
    console.log('#########################################');
    linkedList.unshift(2);
    console.log(linkedList.head, linkedList.head.next, linkedList.head.next.next, '*', linkedList.tail);
    console.log(linkedList.length);
    console.log('#########################################');
    linkedList.push(3);
    // console.log(linkedList.head!, linkedList.head!.next, linkedList.head!.next!.next, linkedList.head!.next!.next!.next, '*', linkedList.tail);
    console.log(linkedList);
    console.log(linkedList.length);
    console.log('#########################################');
    linkedList.head.next.next.delete();
    console.log(linkedList);
    console.log(linkedList.length);
    console.log('#########################################');
    linkedList.destroy();
    console.log(linkedList.head);
    console.log('#########################################');
    linkedList = LinkedList.fromArray([5, 4, 3, 2, 1]);
    console.log(linkedList);
    console.log(linkedList.length);
    console.log('#########################################');
    console.log(linkedList.splice(2, 2));
    console.log(linkedList);
    console.log(linkedList.length);
    console.log('#########################################');
    console.log(linkedList.toArray());
}
