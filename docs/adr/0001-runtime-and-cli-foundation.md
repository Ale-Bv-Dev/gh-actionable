# ADR 0001: Runtime and CLI Foundation

## Status

Accepted

## Decision

Use:

- Node.js as the runtime
- TypeScript as the implementation language
- ESM module format
- a local CLI shape rather than a service, web app, or plugin

## Why

This project is a small developer tool meant to run locally and stay easy to inspect.

Node.js and TypeScript fit the CLI use case well, keep the tooling mainstream, and make it easy to model GitHub API responses safely. ESM keeps the project aligned with the modern Node ecosystem.

A local CLI is the smallest shape that fits the MVP. A service or web app would add hosting, state, and operational complexity that v1 does not need.

## Consequences

- the project stays easy to run locally once dependencies are installed
- implementation can stay close to the command-line workflow it supports
- v1 avoids operational concerns unrelated to issue filtering
