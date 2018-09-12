/**
 * Not type-checking this file because it's mostly vendor code.
 */

/*!
 * HTML Parser By John Resig (ejohn.org)
 * Modified by Juriy "kangax" Zaytsev
 * Original code by Erik Arvidsson, Mozilla Public License
 * http://erik.eae.net/simplehtmlparser/simplehtmlparser.js
 */

import { makeMap, no } from 'shared/util'
import { isNonPhrasingTag } from 'web/compiler/util'

// Regular Expressions for parsing tags and attributes
const attribute = /^\s*([^\s"'<>\/=]+)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?/
// could use https://www.w3.org/TR/1999/REC-xml-names-19990114/#NT-QName
// but for Vue templates we can enforce a simple charset
const ncname = '[a-zA-Z_][\\w\\-\\.]*'
const qnameCapture = `((?:${ncname}\\:)?${ncname})`
const startTagOpen = new RegExp(`^<${qnameCapture}`)
const startTagClose = /^\s*(\/?)>/
// ^<\\/ :以</开始的, [^>]* : 不是>的 任意字符,  > : >结束
const endTag = new RegExp(`^<\\/${qnameCapture}[^>]*>`)
const doctype = /^<!DOCTYPE [^>]+>/i
// #7298: escape - to avoid being pased as HTML comment when inlined in page
const comment = /^<!\--/
const conditionalComment = /^<!\[/

let IS_REGEX_CAPTURING_BROKEN = false
'x'.replace(/x(.)?/g, function (m, g) {
  IS_REGEX_CAPTURING_BROKEN = g === ''
})

// Special Elements (can contain anything)
export const isPlainTextElement = makeMap('script,style,textarea', true)
const reCache = {}

const decodingMap = {
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&amp;': '&',
  '&#10;': '\n',
  '&#9;': '\t'
}
const encodedAttr = /&(?:lt|gt|quot|amp);/g
const encodedAttrWithNewLines = /&(?:lt|gt|quot|amp|#10|#9);/g

// #5992
const isIgnoreNewlineTag = makeMap('pre,textarea', true)
const shouldIgnoreFirstNewline = (tag, html) => tag && isIgnoreNewlineTag(tag) && html[0] === '\n'

function decodeAttr (value, shouldDecodeNewlines) {
  const re = shouldDecodeNewlines ? encodedAttrWithNewLines : encodedAttr
  return value.replace(re, match => decodingMap[match])
}

export function parseHTML (html, options) {
  const stack = []
  const expectHTML = options.expectHTML
  const isUnaryTag = options.isUnaryTag || no
  const canBeLeftOpenTag = options.canBeLeftOpenTag || no
  let index = 0
  let last, lastTag
  /**
   * export function parseHTML (html, options) {
      let lastTag
      while (html) {
        // Make sure we're not in a plaintext content element like script/style
        // 非最后一个标签 非style或script标签
        if (!lastTag || !isPlainTextElement(lastTag)){
          let textEnd = html.indexOf('<')
          if (textEnd === 0) {
              // 处理comment
             if(matchComment) {
               // 前进到comment标签结束的位置
               advance(commentLength)
               continue
             }
             if(matchDoctype) {
               advance(doctypeLength)
               continue
             }
             if(matchEndTag) {
               advance(endTagLength)
               parseEndTag()
               continue
             }
             if(matchStartTag) {
               parseStartTag()
               handleStartTag()
               continue
             }
          }
          // 处理文本
          handleText()
          // 前进到文本结束位置
          advance(textLength)
        } else {
           handlePlainTextElement()
           parseEndTag()
        }
      }
    }
   由于 parseHTML 的逻辑也非常复杂，因此我也用了伪代码的方式表达，整体来说它的逻辑就是循环解析 template ，用正则做各种匹配，对于不同情况分别进行不同的处理，直到整个 template 被解析完毕。 在匹配的过程中会利用 advance 函数不断前进整个模板字符串，直到字符串末尾。

   function advance (n) {
      index += n
      html = html.substring(n)
    }
   * */
  while (html) {
    last = html
    // Make sure we're not in a plaintext content element like script/style
    if (!lastTag || !isPlainTextElement(lastTag)) {
      let textEnd = html.indexOf('<')
      if (textEnd === 0) {
        // 处理comment
        if (comment.test(html)) {
          const commentEnd = html.indexOf('-->');
          if (commentEnd >= 0) {
            if (options.shouldKeepComment) {
              options.comment(html.substring(4, commentEnd))
            }
            // 前进到comment标签结束的位置
            advance(commentEnd + 3)
            continue
          }
        }

        // http://en.wikipedia.org/wiki/Conditional_comment#Downlevel-revealed_conditional_comment
        if (conditionalComment.test(html)) {
          const conditionalEnd = html.indexOf(']>')

          if (conditionalEnd >= 0) {
            advance(conditionalEnd + 2)
            continue
          }
        }

        // Doctype:
        const doctypeMatch = html.match(doctype)
        if (doctypeMatch) {
          advance(doctypeMatch[0].length)
          continue
        }

        // End tag:
        const endTagMatch = html.match(endTag)
        if (endTagMatch) {
          const curIndex = index;
          advance(endTagMatch[0].length);
          /* html为以下模板为例:
          * <div class="wraper m-container-max" id="others">
             <div class="card">
               <div class="card-wrap" v-text="title">
                  11111111
               </div>
             </div>
           </div>
          **/
          // endTagMatch[0] 匹配到的某个结束标签:</div>
          // endTagMatch[1] 匹配到的某个结束标签group,即标签名: div
          // curIndex 在html串中某个结束标签(</div>)的起始位置
          // index 在html串中某个结束标签(</div>)的结束位置
          // 前进到结束标签(如:</div>)结束的位置
          parseEndTag(endTagMatch[1], curIndex, index)
          continue
        }

        // Start tag:
        const startTagMatch = parseStartTag()
        if (startTagMatch) {
          /*
          console.log(JSON.stringify(startTagMatch));
          {"tagName":"div",
            "attrs":[
              [" class=\"wraper m-container-max\"","class","=","wraper m-container-max",null,null],
              [" id=\"others\"","id","=","others",null,null]
             ],
            "start":0,
            "unarySlash":"", // 是否为一元斜杠符 如<img/>  <br/>
            "end":48
          }

          {"tagName":"div",
            "attrs":[[" class=\"card\"","class","=","card",null,null]],
            "start":49,
            "unarySlash":"",
            "end":67
          }

          {"tagName":"div",
            "attrs":[
              [" class=\"card-wrap\"","class","=","card-wrap",null,null],
              [" v-text=\"title\"","v-text","=","title",null,null]
            ],
            "start":69,
            "unarySlash":"",
            "end":107
          }
          */
          handleStartTag(startTagMatch)
          if (shouldIgnoreFirstNewline(lastTag, html)) {
            advance(1)
          }
          continue
        }
      }
      /*
      * 接下来判断 textEnd 是否大于等于 0 的，满足则说明到从当前位置到 textEnd 位置都是文本，
      * 并且如果 < 是纯文本中的字符，就继续找到真正的文本结束的位置，然后前进到结束的位置。
      * 再继续判断 textEnd 小于 0 的情况，则说明整个 template 解析完毕了，
      * 把剩余的 html 都赋值给了 text
      * */
      let text, rest, next
      if (textEnd >= 0) {
        rest = html.slice(textEnd)
        while (
          !endTag.test(rest) &&
          !startTagOpen.test(rest) &&
          !comment.test(rest) &&
          !conditionalComment.test(rest)
        ) {
          // < in plain text, be forgiving and treat it as text
          next = rest.indexOf('<', 1)
          if (next < 0) break
          textEnd += next
          rest = html.slice(textEnd)
        }
        text = html.substring(0, textEnd)
        advance(textEnd)
      }

      if (textEnd < 0) {
        text = html
        html = ''
      }
      // 最后调用了 options.chars 回调函数，并传 text 参数
      if (options.chars && text) {
        // text 为文本字符串 如html模板示例中的1111111
        options.chars(text)
      }
    } else {
      // <script> <style>标签处理
      let endTagLength = 0
      const stackedTag = lastTag.toLowerCase()
      const reStackedTag = reCache[stackedTag] || (reCache[stackedTag] = new RegExp('([\\s\\S]*?)(</' + stackedTag + '[^>]*>)', 'i'))
      const rest = html.replace(reStackedTag, function (all, text, endTag) {
        endTagLength = endTag.length
        if (!isPlainTextElement(stackedTag) && stackedTag !== 'noscript') {
          text = text
            .replace(/<!\--([\s\S]*?)-->/g, '$1') // #7298
            .replace(/<!\[CDATA\[([\s\S]*?)]]>/g, '$1')
        }
        if (shouldIgnoreFirstNewline(stackedTag, text)) {
          text = text.slice(1)
        }
        if (options.chars) {
          options.chars(text)
        }
        return ''
      })
      index += html.length - rest.length
      html = rest
      parseEndTag(stackedTag, index - endTagLength, index)
    }

    if (html === last) {
      options.chars && options.chars(html)
      if (process.env.NODE_ENV !== 'production' && !stack.length && options.warn) {
        options.warn(`Mal-formatted tag at end of template: "${html}"`)
      }
      break
    }
  }

  // Clean up any remaining tags
  parseEndTag()
  // 用于html串解析前进
  function advance (n) {
    index += n
    html = html.substring(n)
  }
  /*
  对于开始标签，除了标签名之外，还有一些标签相关的属性。
  函数先通过正则表达式 startTagOpen 匹配到开始标签，然后定义了 match 对象，
  接着循环去匹配开始标签中的属性并添加到 match.attrs 中，直到匹配的开始标签的闭合符结束。
  如果匹配到闭合符，则获取一元斜线符(如<img/>  <br/>)，前进到闭合符尾，
  并把当前索引赋值给 match.end
  * */
  function parseStartTag () {
    const start = html.match(startTagOpen)
    if (start) {
      const match = {
        tagName: start[1],
        attrs: [],
        start: index
      }
      /* html为以下模板为例:
       * <div class="wraper m-container-max" id="others">
           <div class="card">
             <div class="card-wrap" v-text="title">
                11111111
             </div>
           </div>
         </div>
       **/
      // startTagOpen: 匹配起始标签  start[0] : <div
      // startTagClose: 匹配起始标签的闭合标签 : >
      advance(start[0].length)
      let end, attr
      while (!(end = html.match(startTagClose)) && (attr = html.match(attribute))) {
        // attribute: 循环匹配属性
        // console.log(attr[0]):
        /*
        * class="wraper m-container-max"
         id="others"
         class="card"
         class="card-wrap"
         v-text="title"
         */
        advance(attr[0].length)
        match.attrs.push(attr)
      }
      if (end) {
        //unarySlash: 一元斜杠符 如<img/>  <br/>
        match.unarySlash = end[1]
        // 前进到开始标签的闭合位置
        advance(end[0].length)
        // 记录开始标签闭合位置的index
        match.end = index
        return match
      }
    }
  }
  /*
   parseStartTag 对开始标签解析拿到 match 后，紧接着会执行 handleStartTag 对 match 做处理
   handleStartTag 的核心逻辑很简单，先判断开始标签是否是一元标签，类似 <img>、<br/> 这样，接着对 match.attrs 遍历并做了一些处理，最后判断如果非一元标签，则往 stack 里 push 一个对象，并且把 tagName 赋值给 lastTag
   最后会执行 start 回调函数，函数主要就做 3 件事情，创建 AST 元素，处理 AST 元素，AST 树管理

  html为以下模板为例:
   <div class="wraper m-container-max" id="others">
     <div class="card">
       <div class="card-wrap" v-text="title">
          11111111
       </div>
     </div>
   </div>

   stack为还未处理闭合的开始标签的堆栈,最后处理结果为:
   [
     {"tag":"div","lowerCasedTag":"div","attrs":[{"name":"id","value":"others"}]},
     {"tag":"div","lowerCasedTag":"div","attrs":[]},
     {"tag":"div","lowerCasedTag":"div","attrs":[{"name":"v-text","value":"title"}]}
   ]
   */
  function handleStartTag (match) {
    /*
    * match:
    * {"tagName":"div",
       "attrs":[
         [" class=\"card-wrap\"","class","=","card-wrap",null,null],
         [" v-text=\"title\"","v-text","=","title",null,null]
       ],
       "start":69,
       "unarySlash":"",
       "end":107
     }
     */
    const tagName = match.tagName
    const unarySlash = match.unarySlash

    if (expectHTML) {
      /* 一元斜杠开始标签和结束标签只有一个 如<img> 或<img/> */
      if (lastTag === 'p' && isNonPhrasingTag(tagName)) {
        parseEndTag(lastTag)
      }
      if (canBeLeftOpenTag(tagName) && lastTag === tagName) {
        parseEndTag(tagName)
      }
    }

    const unary = isUnaryTag(tagName) || !!unarySlash

    const l = match.attrs.length
    const attrs = new Array(l)
    for (let i = 0; i < l; i++) {
      const args = match.attrs[i]
      // hackish work around FF bug https://bugzilla.mozilla.org/show_bug.cgi?id=369778
      if (IS_REGEX_CAPTURING_BROKEN && args[0].indexOf('""') === -1) {
        if (args[3] === '') { delete args[3] }
        if (args[4] === '') { delete args[4] }
        if (args[5] === '') { delete args[5] }
      }
      const value = args[3] || args[4] || args[5] || ''
      const shouldDecodeNewlines = tagName === 'a' && args[1] === 'href'
        ? options.shouldDecodeNewlinesForHref
        : options.shouldDecodeNewlines
      attrs[i] = {
        name: args[1],
        value: decodeAttr(value, shouldDecodeNewlines)
      }
    }

    if (!unary) {
      //!unary: 非一元斜杠符 如<img/>  <br/>,
      // 存入stack(stack为还未处理闭合的开始标签的堆栈)
      stack.push({ tag: tagName, lowerCasedTag: tagName.toLowerCase(), attrs: attrs })
      lastTag = tagName
    }

    if (options.start) {
      options.start(tagName, attrs, unary, match.start, match.end)
      /*
       当解析到开始标签的时候，最后会执行 start 回调函数，函数主要就做 3 件事情:
       创建 AST 元素，处理 AST 元素，AST 树管理
       对应伪代码：
       start (tag, attrs, unary) {
         let element = createASTElement(tag, attrs)
         processElement(element)
         treeManagement()
       }
       */
    }
  }

  function parseEndTag (tagName, start, end) {
    // tagName 标签名
    // start 在html串中某个结束标签(</div>)的起始位置
    // end 在html串中某个结束标签(</div>)的结束位置
    let pos, lowerCasedTagName
    if (start == null) start = index
    if (end == null) end = index

    if (tagName) {
      lowerCasedTagName = tagName.toLowerCase()
    }

    // Find the closest opened tag of the same type
    // 假如结束标签是</div>,那么就去寻找最近的那个敞开的开始<div>标签
    /* html为以下模板为例:
     * <div class="wraper m-container-max" id="others">
         <div class="card">
           <div class="card-wrap" v-text="title">
              11111111
           </div>
         </div>
       </div>
     **/
    // stack为还未处理闭合的开始标签的堆栈 console.log(JSON.stringify(stack))
    /* [{"tag":"div","lowerCasedTag":"div","attrs":[{"name":"id","value":"others"}]},            {"tag":"div","lowerCasedTag":"div","attrs":[]},
        {"tag":"div","lowerCasedTag":"div","attrs":[{"name":"v-text","value":"title"}]}
       ] */

    /*
     那么对于闭合标签的解析，就是倒序 stack，找到第一个和当前 endTag 匹配的元素。
     如果是正常的标签匹配，那么 stack 的最后一个元素应该和当前的 endTag 匹配
     但是考虑到如下错误情况：
     <div><span></div>
     这个时候当 endTag 为 </div> 的时候，从 stack 尾部找到的标签是 <span>，就不能匹配，
     因此这种情况会报警告。匹配后把栈到 pos 位置的都弹出，并从 stack 尾部拿到 lastTag
     */
    if (tagName) {
      for (pos = stack.length - 1; pos >= 0; pos--) {
        // 从最后一个开始找最近的那个名字相同的开始标签
        if (stack[pos].lowerCasedTag === lowerCasedTagName) {
          break
        }
      }
    } else {
      // If no tag name is provided, clean shop
      pos = 0
    }

    if (pos >= 0) {
      // Close all the open elements, up the stack
      // 一旦找到闭合标签,就做闭合处理,开始标签从stack里移除。(stack只是还未处理闭合配对的标签)
      for (let i = stack.length - 1; i >= pos; i--) {
        if (process.env.NODE_ENV !== 'production' &&
          (i > pos || !tagName) &&
          options.warn
        ) {
          options.warn(
            `tag <${stack[i].tag}> has no matching end tag.`
          )
        }
        if (options.end) {
          options.end(stack[i].tag, start, end)
        }
      }

      // Remove the open elements from the stack
      stack.length = pos
      lastTag = pos && stack[pos - 1].tag
    } else if (lowerCasedTagName === 'br') {
      /*
       一元斜杠标签的结束标签与开始标签是同一个
       当解析到开始标签的时候，最后会执行 start 回调函数，函数主要就做 3 件事情:
       创建 AST 元素，处理 AST 元素，AST 树管理
       对应伪代码：
       start (tag, attrs, unary) {
         let element = createASTElement(tag, attrs)
         processElement(element)
         treeManagement()
       }
       */
      if (options.start) {
        options.start(tagName, [], true, start, end)
      }
    } else if (lowerCasedTagName === 'p') {
      if (options.start) {
        options.start(tagName, [], false, start, end)
      }
      /* 当解析到闭合标签的时候，最后会执行 end 回调函数
       对应伪代码：
       end () {
         treeManagement()
         closeElement()
       }
       */
      if (options.end) {
        options.end(tagName, start, end)
      }
    }
  }
}
