
const babylon = require('babylon');
const traverse = require('@babel/traverse')["default"];
const generate = require('@babel/generator')["default"];
// traverse path的时候解析path
const parseTemplate = require('./parser/index.js');
// 对于模板的预处理 - 后置处理 - 等正则的一些替换；
const processTemplate = require('./common/process-template.js')
// 目前事件的处理有两处：第一，c-bind,第二c-model,两者互相不影响；借鉴于此，需要新增处理事件支持传参的形式，而此时就需要处理c-bind;
exports.compileTemplateForVue = function (source, type, options) {
  // source
  // 预处理html模板中的注释，将其删除；这个需要优先处理，防止解析 < > 的时候出现问题；
  source = processTemplate.preDisappearAnnotation(source);
  // 预处理：<   >  ==>  _cml&lt&lmc_  _cml&gt&lmc_,这么做的目的为了防止 preParseMustache 解析 > < 中间的内容报错，所以需要将 > < 先转化 gt lt的形式，等 preParseMustache 解析完毕之后即可将其转化回来；
  source = processTemplate.preParseGtLt(source);
  source = processTemplate.preParseDiffPlatformTag(source, type);
  // 预处理:属性  :name="sth" ==> v-bind:name="sth" jsx无法解析 :name="sth"
  source = processTemplate.preParseBindAttr(source);
  // 预处理vue事件 @click="handleClick" ==> c-bind:click="handleClick"
  source = processTemplate.preParseVueEvent(source);
  // 预处理 标签内的 {{item.id}} 这种语法jsx无法识别，转化为 _cml{item.id}lmc_
  source = processTemplate.preParseMustache(source);
  // 后置处理：解析_cml_lt_lmc_ ==> < _cml_gt_lmc_ ==> >
  source = processTemplate.postParseLtGt(source);
  // 预处理c-animation 标签，给这个标签增加一个 c-bind:transitionend = "_animationCb(value,$event)"，注意这个必须在所有预处理的最后，因为前面的预处理兼容了jsx的语法；
  source = processTemplate.preParseAnimation(source, type);
  // source = processTemplate.alipayComponentsWraped(source, type, options);

  if (type === 'web') {
    source = compileWebTemplate(source, type, options).code;
  }
  if (type === 'weex') {
    source = compileWeexTemplate(source, type, options).code;
  }
  if (type === 'wx') {
    source = compileWxTemplate(source, type, options).code;
  }
  if (type === 'alipay') {
    source = compileAliPayTemplate(source, type, options).code;
  }
  if (type === 'baidu') {
    source = compileBaiduTemplate(source, type, options).code;
  }
  // 后置处理，解析origin-tag ==> tag
  source = processTemplate.postParseOriginTag(source)
  // 后置处理：解析_cml{str}lmc_ ==> {{str}}
  source = processTemplate.postParseMustache(source)
  // 后置处理：用于处理 \u ，便于解析unicode 中文
  source = processTemplate.postParseUnicode(source);
  return {
    source,
    usedBuildInTagMap: options.usedBuildInTagMap
  }
}
function compileWebTemplate(source, type, options) {

  const ast = babylon.parse(source, {
    plugins: ['jsx']
  })
  traverse(ast, {
    enter(path) {
      parseTemplate.parseClassStatement(path, type, options);
      // 微信端支持安震 slider
      parseTemplate.parseTagForSlider(path, type, options);
      parseTemplate.parseBuildTag(path, type, options) // 解析内置标签；

      parseTemplate.parseTag(path, type, options);// 替换标签；

      parseTemplate.parseAnimationStatement(path, type, options);

      parseTemplate.parseEventListener(path, type, options)

      // 解析c-model ==> v-bind:value="modelValue" v-on:input="_cmlModelEventProxy($event,modelKey)"
      parseTemplate.parseDirectiveStatement(path, type, options);
      parseTemplate.parseStyleStatement(path, type, options)
      // wx alipay 的 {{}}语法中转换成vue属性表达式    class="a{{b}}"  -> :class = "'a'+(b)"
      parseTemplate.parseAttributeStatement(path, type, options);
      // 最后处理模板中的标签  block-->template
      parseTemplate.afterParseTag(path, type, options);
    }
  })
  return generate(ast);
}
function compileWeexTemplate(source, type, options) {

  const ast = babylon.parse(source, {
    plugins: ['jsx']
  })
  traverse(ast, {
    enter(path) {
      parseTemplate.parseClassStatement(path, type, options);

      // 这个最优先；
      parseTemplate.parseBuildTag(path, type, options) // 解析内置标签；
      parseTemplate.parseTag(path, type, options);// 替换标签；

      parseTemplate.parseAnimationStatement(path, type, options);

      parseTemplate.parseEventListener(path, type, options)
      // 解析v-model ==> v-bind:value="modelValue" v-on:input="_cmlModelEventProxy($event,modelKey)"
      parseTemplate.parseDirectiveStatement(path, type, options);
      // style的处理判断是否是动态和静态的依赖{{}} 需要在parseAttributeStatement之前执行，parseAttributeStatement会处理掉{{}}
      parseTemplate.parseStyleStatement(path, type, options)
      // {{}}中转换成vue属性表达式    class="a{{b}}"  -> :class = "'a'+(b)"
      parseTemplate.parseAttributeStatement(path, type, options);
      parseTemplate.afterParseTag(path, type, options);
    }
  })
  return generate(ast);
}
function compileWxTemplate(source, type, options) {

  const ast = babylon.parse(source, {
    plugins: ['jsx']
  })
  traverse(ast, {
    enter(path) {
      parseTemplate.parseClassStatement(path, type, options);
      // 微信端支持安震 slider
      parseTemplate.parseTagForSlider(path, type, options);
      // 微信端支持 ref；
      parseTemplate.parseRefStatement(path, type, options)
      parseTemplate.parseBuildTag(path, type, options) // 解析内置标签；
      parseTemplate.parseTag(path, type, options);// 替换标签；

      parseTemplate.parseAnimationStatement(path, type, options);
      parseTemplate.afterParseTag(path, type, options);
      parseTemplate.parseEventListener(path, type, options);
      // 解析v-model ==> value="{{modelValue}}" bindinput="_cmlModelEventProxy($event) data-modelkey="modelKey"
      parseTemplate.parseDirectiveStatement(path, type, options);
      // parseTemplate.parseIterationStatement(path,type,options);
      parseTemplate.parseStyleStatement(path, type, options);
      // 用于支持 v-bind:name="sth" ==> name="{{sth}}"  v-for  v-if
      parseTemplate.parseVue2WxStatement(path, type, options);
    }
  })
  return generate(ast);
}
function compileAliPayTemplate(source, type, options) {
  const ast = babylon.parse(source, {
    plugins: ['jsx']
  })
  traverse(ast, {
    enter(path) {
      parseTemplate.parseClassStatement(path, type, options);
      // 微信端支持安震 slider
      parseTemplate.parseTagForSlider(path, type, options);
      // 微信端支持 ref；
      parseTemplate.parseRefStatement(path, type, options)
      parseTemplate.parseBuildTag(path, type, options) // 解析内置标签；
      parseTemplate.parseTag(path, type, options);// 替换标签；

      parseTemplate.parseAnimationStatement(path, type, options);
      parseTemplate.afterParseTag(path, type, options);
      parseTemplate.parseEventListener(path, type, options);
      // 解析v-model ==> value="{{modelValue}}" bindinput="_cmlModelEventProxy($event) data-modelkey="modelKey"
      parseTemplate.parseDirectiveStatement(path, type, options);
      parseTemplate.parseStyleStatement(path, type, options);
      // 用于支持 v-bind:name="sth" ==> name="{{sth}}"  v-for  v-if
      parseTemplate.parseVue2WxStatement(path, type, options);
    }
  })
  return generate(ast);
}
function compileBaiduTemplate(source, type, options) {
  const ast = babylon.parse(source, {
    plugins: ['jsx']
  })
  traverse(ast, {
    enter(path) {
      parseTemplate.parseClassStatement(path, type, options);
      // 微信端支持安震 slider
      parseTemplate.parseTagForSlider(path, type, options);
      // 微信端支持 ref；
      parseTemplate.parseRefStatement(path, type, options)
      parseTemplate.parseBuildTag(path, type, options) // 解析内置标签；
      parseTemplate.parseTag(path, type, options);// 替换标签；

      parseTemplate.parseAnimationStatement(path, type, options);
      parseTemplate.afterParseTag(path, type, options);
      parseTemplate.parseEventListener(path, type, options);
      // 解析v-model ==> value="{{modelValue}}" bindinput="_cmlModelEventProxy($event) data-modelkey="modelKey"
      parseTemplate.parseDirectiveStatement(path, type, options);
      parseTemplate.parseStyleStatement(path, type, options);
      // 用于支持 v-bind:name="sth" ==> name="{{sth}}"  v-for  v-if
      parseTemplate.parseVue2WxStatement(path, type, options);
    }
  })
  return generate(ast);
}
