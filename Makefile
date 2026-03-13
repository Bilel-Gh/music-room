SHELL := /bin/bash

install:
	cd backend && npm install
	cd mobile && npm install

dev:
	cd backend && npm run dev

dev-docker:
	docker compose up --remove-orphans

dev-android:
	cd mobile && npx expo run:android

dev-web:
	cd mobile && npx expo start --web

build:
	cd backend && npm run build

test:
	cd backend && npm test

db-migrate:
	cd backend && npx prisma migrate dev

db-generate:
	cd backend && npx prisma generate

db-studio:
	cd backend && npx prisma studio

load-test:
	cd backend && bash scripts/load-test.sh

clean:
	rm -rf backend/node_modules backend/dist mobile/node_modules
