/* @flow */

import { baseOptions } from './options'
import { createCompiler } from 'compiler/index'
/* 可以看到 compileToFunctions 方法实际上是 createCompiler 方法的返回值，该方法接收一个编译配置参数，接下来我们来看一下 createCompiler 方法的定义，在 src/compiler/index.js 中 */
const { compile, compileToFunctions } = createCompiler(baseOptions)

export { compile, compileToFunctions }
