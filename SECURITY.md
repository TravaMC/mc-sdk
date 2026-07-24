# Security Policy

## Supported versions

Security fixes are applied on the latest `main` release line of **mc-sdk**.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security-sensitive reports.

Prefer a private channel (GitHub Security Advisory on the repository, or contact the maintainer listed on the repo). Include:

- Affected version / commit  
- Reproduction steps  
- Impact (e.g. path traversal, SSRF via docs fetch, cache poisoning)

## Scope notes

- This project fetches public Paper / Purpur / Mojang / Hangar HTTP resources and caches them under `~/.cache/mc-sdk`.  
- Do not paste secrets into MCP configs that you commit. Example MCP config must stay free of tokens.  
- Mojang mapping files must not be redistributed from this repository.
