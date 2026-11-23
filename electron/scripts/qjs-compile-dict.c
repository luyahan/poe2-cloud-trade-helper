// 编译期工具：把 compiled.json 转成 bellard QuickJS JS_WriteObject 二进制
// 用法：qjs-compile-dict <input.json> <output.bin>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "quickjs.h"
#include "quickjs-libc.h"

int main(int argc, char **argv) {
    if (argc < 3) {
        fprintf(stderr, "用法: %s <input.compiled.json> <output.qjs.bin>\n", argv[0]);
        return 1;
    }
    const char *inputPath = argv[1];
    const char *outputPath = argv[2];

    // 读取 compiled.json
    FILE *f = fopen(inputPath, "rb");
    if (!f) { perror("open input"); return 1; }
    fseek(f, 0, SEEK_END);
    long size = ftell(f);
    fseek(f, 0, SEEK_SET);
    char *json = malloc(size + 1);
    fread(json, 1, size, f);
    json[size] = 0;
    fclose(f);

    // 初始化 QuickJS
    JSRuntime *rt = JS_NewRuntime();
    JSContext *ctx = JS_NewContext(rt);
    js_std_add_helpers(ctx, 0, NULL);
    js_init_module_std(ctx, "std");
    js_init_module_os(ctx, "os");

    // 把 std/os 注册为全局对象（便于 JS 直接用 std.loadFile）
    JSValue global = JS_GetGlobalObject(ctx);
    JS_SetPropertyStr(ctx, global, "std", JS_NewCModule(ctx, "std", NULL) ? JS_UNDEFINED : JS_UNDEFINED);
    // 实际上 js_init_module_std 只是注册模块；需要用 JS_Eval 导入
    const char *importScript =
        "import * as std from 'std';"
        "globalThis.std = std;";
    JS_Eval(ctx, importScript, strlen(importScript), "<import>", JS_EVAL_TYPE_MODULE);

    // 在 JS 中解析 JSON 并重建 Map 结构
    // 用一个包装脚本：读取 JSON → 重建 Map → 暴露到 globalThis
    const char *script = "(function(){"
        "const serialized = JSON.parse(std.loadFile('" /* inputPath */;
    // 拼接脚本（避免 C 字符串过长，分段）
    char buf[65536];
    snprintf(buf, sizeof(buf),
        "(function(){"
        "const serialized = JSON.parse(std.loadFile('%s'));"
        "const compiled = {};"
        "for (const [groupId, tuples] of Object.entries(serialized)) {"
        "  const map = new Map();"
        "  for (const [key, value] of tuples) {"
        "    if (key === '__patterns__') map.set(key, new Map(value));"
        "    else map.set(key, value);"
        "  }"
        "  compiled[groupId] = map;"
        "}"
        "return compiled;"
        "})()",
        inputPath
    );

    JSValue val = JS_Eval(ctx, buf, strlen(buf), "<build>", JS_EVAL_TYPE_GLOBAL);
    if (JS_IsException(val)) {
        js_std_dump_error(ctx);
        return 1;
    }

    // JS_WriteObject 序列化（flag=0，不含字节码）
    size_t outSize = 0;
    uint8_t *outBuf = JS_WriteObject(ctx, &outSize, val, 0);
    JS_FreeValue(ctx, val);
    if (!outBuf) {
        js_std_dump_error(ctx);
        return 1;
    }

    // 写入输出文件
    FILE *out = fopen(outputPath, "wb");
    if (!out) { perror("open output"); return 1; }
    fwrite(outBuf, 1, outSize, out);
    fclose(out);
    js_free(ctx, outBuf);

    printf("qjs.bin OK: %zu bytes (%.1f KB)\n", outSize, outSize / 1024.0);

    JS_FreeContext(ctx);
    JS_FreeRuntime(rt);
    free(json);
    return 0;
}
