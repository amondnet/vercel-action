# Use the latest version of Node.js
#
# You may prefer the full image:
# FROM node
#
# or even an alpine image (a smaller, faster, less-feature-complete image):
# FROM node:alpine
#
# You can specify a version:
# FROM node:10-slim
FROM node:12-alpine

# Labels for GitHub to read your action
LABEL "com.github.actions.name"="comment-on-pull-request"
LABEL "com.github.actions.description"="GitHub action to auto comment on the PR which triggers the action"
# Here are all of the available icons: https://feathericons.com/
LABEL "com.github.actions.icon"="message-circle"
# And all of the available colors: https://developer.github.com/actions/creating-github-actions/creating-a-docker-container/#label
LABEL "com.github.actions.color"="white"

# Copy the package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN yarn

# Copy the rest of your action's code
COPY . .

# Run `node /index.js`
ENTRYPOINT ["node", "/index.js"]
