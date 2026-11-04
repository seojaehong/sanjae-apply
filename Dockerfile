# Glama 등 MCP 목록 사이트가 stdio 서버를 띄워 도구 목록을 확인할 때 쓴다.
FROM node:20-slim
RUN npm install -g sanjae-apply@0.5.6 && npm cache clean --force
ENTRYPOINT ["sanjae-apply", "mcp"]
