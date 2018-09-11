/* 这里有 2 处关键的代码，import Vue from './instance/index' 和 initGlobalAPI(Vue)初始化全局 Vue API */
// 创建vue实例
import Vue from './instance/index'
// Vue.js 在整个初始化过程中，除了给它的原型 prototype 上扩展方法，
// 还会给 Vue 这个对象本身扩展全局的静态方法
import { initGlobalAPI } from './global-api/index'
import { isServerRendering } from 'core/util/env'
import { FunctionalRenderContext } from 'core/vdom/create-functional-component'

initGlobalAPI(Vue)

Object.defineProperty(Vue.prototype, '$isServer', {
  get: isServerRendering
})

Object.defineProperty(Vue.prototype, '$ssrContext', {
  get () {
    /* istanbul ignore next */
    return this.$vnode && this.$vnode.ssrContext
  }
})

// expose FunctionalRenderContext for ssr runtime helper installation
Object.defineProperty(Vue, 'FunctionalRenderContext', {
  value: FunctionalRenderContext
})

Vue.version = '__VERSION__'

export default Vue
