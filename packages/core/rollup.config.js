import commonjs from "@rollup/plugin-commonjs"
import { defineConfig } from "rollup"
import dts from "rollup-plugin-dts"
import esbuild from "rollup-plugin-esbuild"
import { dependencies, devDependencies } from "./package.json"

const entry = ["src/index.ts"]

const external = Object.keys(dependencies ?? {}).concat(Object.keys(devDependencies ?? {}))

export default defineConfig(() => [
    {
        external,
        input: entry,
        output: {
            dir: "dist",
            entryFileNames: "[name].js",
            format: "cjs"
        },
        plugins: [
            commonjs(),
            esbuild({
                target: "es6"
            })
        ]
    },
    {
        external,
        input: entry,
        output: {
            dir: "dist",
            entryFileNames: "[name].mjs",
            format: "esm"
        },
        plugins: [
            commonjs(),
            esbuild({
                target: "es6"
            })
        ]
    },
    {
        external,
        input: entry,
        output: {
            file: "dist/index.d.ts",
            format: "esm"
        },
        plugins: [dts()]
    },

    {
        external,
        input: ["src/bin.ts"],
        output: {
            dir: "bin",
            entryFileNames: "index.js",
            format: "cjs"
        },
        plugins: [
            commonjs(),
            esbuild({
                target: "es6"
            })
        ]
    },
    {
        external,
        input: ["src/bin.ts"],
        output: {
            file: "dist/bin.d.ts",
            format: "esm"
        },
        plugins: [dts()]
    }
])
