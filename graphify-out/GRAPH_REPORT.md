# Graph Report - aws-utils  (2026-11-09)

## Corpus Check
- 61 files · ~28,789 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 504 nodes · 666 edges · 34 communities (25 shown, 9 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `734f1c27`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- dependencies
- iam-commands.ts
- getNormalizedPath
- README.md
- compilerOptions
- devDependencies
- package.json
- compilerOptions
- devDependencies
- S3Bucket
- lambda-events.ts
- scripts
- s3-util.localstack.ts
- config.ts
- logger.ts
- What You Must Do When Invoked
- `@hdriel/aws-utils` — Usage Reference
- sns-topic.ts
- graphify reference: extra exports and benchmark
- graphify reference: query, path, explain
- engineering-manager.md
- implementer.md
- reviewer.md
- graphify reference: add a URL and watch a folder
- graphify reference: commit hook and native CLAUDE.md integration
- graphify reference: incremental update and cluster-only
- test-writer.md
- graphify reference: GitHub clone and cross-repo merge
- graphify reference: transcribe video and audio
- CLAUDE.md
- .claude/CLAUDE.md
- extraction-spec.md

## God Nodes (most connected - your core abstractions)
1. `getNormalizedPath()` - 33 edges
2. `compilerOptions` - 24 edges
3. `compilerOptions` - 18 edges
4. `S3Stream` - 18 edges
5. `S3Bucket` - 16 edges
6. `S3File` - 16 edges
7. `What You Must Do When Invoked` - 12 edges
8. `S3Directory` - 11 edges
9. `S3UploadOptions` - 11 edges
10. ``@hdriel/aws-utils` — Usage Reference` - 11 edges

## Surprising Connections (you probably didn't know these)
- `S3Bucket` --inherits--> `S3Base`  [EXTRACTED]
  src/aws/s3/s3-bucket.ts → src/aws/s3/s3-base.ts
- `S3Directory` --inherits--> `S3Bucket`  [EXTRACTED]
  src/aws/s3/s3-directory.ts → src/aws/s3/s3-bucket.ts
- `S3Util` --inherits--> `S3Stream`  [EXTRACTED]
  src/aws/s3/s3-util.ts → src/aws/s3/s3-stream.ts
- `IamCommands` --inherits--> `IamBase`  [EXTRACTED]
  src/aws/iam/iam-commands.ts → src/aws/iam/iam-base.ts
- `IamUtil` --inherits--> `IamCommands`  [EXTRACTED]
  src/aws/iam/iam-util.ts → src/aws/iam/iam-commands.ts

## Import Cycles
- None detected.

## Communities (34 total, 9 thin omitted)

### Community 0 - "dependencies"
Cohesion: 0.05
Nodes (41): archiver, aws-crt, @aws-sdk/client-iam, @aws-sdk/client-lambda, @aws-sdk/client-s3, @aws-sdk/client-ses, @aws-sdk/client-sns, @aws-sdk/lib-storage (+33 more)

### Community 1 - "iam-commands.ts"
Cohesion: 0.17
Nodes (6): IamBase, IamBaseProps, IamCommands, IamCommandsProps, IamUtil, IamUtilProps

### Community 2 - "getNormalizedPath"
Cohesion: 0.07
Nodes (29): S3Base, S3BaseProps, S3BucketProps, S3Directory, S3DirectoryProps, S3File, S3FileProps, pump (+21 more)

### Community 3 - "README.md"
Cohesion: 0.06
Nodes (35): 🔧 Advanced Usage, 👤 Author, AWS UTILS: S3, LAMBDA SNS, IAM, C.R.U.D Bucket Operations, 📁 C.R.U.D Directory Operations, 📄 C.R.U.D File Operations, Client Side, Client side (+27 more)

### Community 4 - "compilerOptions"
Cohesion: 0.06
Nodes (34): demo, node, src/__mocks__, src/__tests__, compilerOptions, allowImportingTsExtensions, declaration, declarationDir (+26 more)

### Community 5 - "devDependencies"
Cohesion: 0.07
Nodes (29): express, devDependencies, cross-env, express, prettier, ts-node, tsup, @types/archiver (+21 more)

### Community 6 - "package.json"
Cohesion: 0.07
Nodes (27): author, bugs, url, description, exports, files, license, main (+19 more)

### Community 7 - "compilerOptions"
Cohesion: 0.08
Nodes (23): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, esModuleInterop, lib, module, moduleDetection, moduleResolution (+15 more)

### Community 8 - "devDependencies"
Cohesion: 0.10
Nodes (21): devDependencies, cross-env, dotenv, dotenv-expand, jest, pathe, ts-jest, tsx (+13 more)

### Community 10 - "lambda-events.ts"
Cohesion: 0.11
Nodes (11): AWSConfigSharingUtil, LambdaBase, LambdaBaseProps, decodeLambdaPayload(), LambdaEvents, LambdaEventsProps, LambdaPayloadResponse, LambdaRawPayload (+3 more)

### Community 11 - "scripts"
Cohesion: 0.12
Nodes (16): dependencies, @hdriel/aws-utils, name, private, scripts, dev:iam, dev:s3-bucket, dev:util (+8 more)

### Community 12 - "s3-util.localstack.ts"
Cohesion: 0.19
Nodes (6): S3StreamProps, S3LocalstackUtil, S3LocalstackUtilProps, S3Util, S3UtilProps, ContentFile

### Community 17 - "What You Must Do When Invoked"
Cohesion: 0.08
Nodes (24): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+16 more)

### Community 18 - "`@hdriel/aws-utils` — Usage Reference"
Cohesion: 0.10
Nodes (19): 10. Behavior gotchas (read before debugging), 1. Install, 2. Credentials & region resolution, 3. S3 — `S3Util`, 4. S3 Express middlewares (streaming & uploads), 5. S3 on LocalStack — `S3LocalstackUtil`, 6. Lambda — `LambdaUtil<TPayload, TResult>`, 7. SNS — `SnsUtil<T>` (+11 more)

### Community 19 - "sns-topic.ts"
Cohesion: 0.19
Nodes (6): SnsBase, SnsBaseProps, SnsTopic, SnsTopicProps, SnsUtil, SnsUtilProps

### Community 20 - "graphify reference: extra exports and benchmark"
Cohesion: 0.22
Nodes (8): graphify reference: extra exports and benchmark, Step 6b - Wiki (only if --wiki flag), Step 7 - Neo4j export (only if --neo4j or --neo4j-push flag), Step 7a - FalkorDB export (only if --falkordb or --falkordb-push flag), Step 7b - SVG export (only if --svg flag), Step 7c - GraphML export (only if --graphml flag), Step 7d - MCP server (only if --mcp flag), Step 8 - Token reduction benchmark (only if total_words > 5000)

### Community 21 - "graphify reference: query, path, explain"
Cohesion: 0.33
Nodes (5): For /graphify explain, For /graphify path, graphify reference: query, path, explain, Step 0 — Constrained query expansion (REQUIRED before traversal), Step 1 — Traversal

### Community 22 - "engineering-manager.md"
Cohesion: 0.50
Nodes (3): Process for every feature request, Rules, Your team

### Community 23 - "implementer.md"
Cohesion: 0.50
Nodes (3): How you work, What to report back, When you're re-invoked with review feedback

### Community 24 - "reviewer.md"
Cohesion: 0.50
Nodes (3): How to review, What to check, What to report back

### Community 25 - "graphify reference: add a URL and watch a folder"
Cohesion: 0.50
Nodes (3): For /graphify add, For --watch, graphify reference: add a URL and watch a folder

### Community 26 - "graphify reference: commit hook and native CLAUDE.md integration"
Cohesion: 0.50
Nodes (3): For git commit hook, For native CLAUDE.md integration, graphify reference: commit hook and native CLAUDE.md integration

### Community 27 - "graphify reference: incremental update and cluster-only"
Cohesion: 0.50
Nodes (3): For --cluster-only, For --update (incremental re-extraction), graphify reference: incremental update and cluster-only

## Knowledge Gaps
- **226 isolated node(s):** `name`, `private`, `version`, `type`, `dev:util` (+221 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `dependencies` to `package.json`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **Why does `getNormalizedPath()` connect `getNormalizedPath` to `s3-util.localstack.ts`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `devDependencies` to `package.json`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _226 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.04878048780487805 - nodes in this community are weakly interconnected._
- **Should `getNormalizedPath` be split into smaller, more focused modules?**
  _Cohesion score 0.07191780821917808 - nodes in this community are weakly interconnected._
- **Should `README.md` be split into smaller, more focused modules?**
  _Cohesion score 0.05555555555555555 - nodes in this community are weakly interconnected._