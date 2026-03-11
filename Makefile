install:
	cd backend && npm install
	cd mobile && npm install

dev:
	cd backend && npm run dev

dev-mobile:
	cd mobile && npx expo start --tunnel

dev-all:
	$(MAKE) dev & $(MAKE) dev-mobile

build:
	cd backend && npm run build

test:
	cd backend && npm test

db-migrate:
	cd backend && npx prisma migrate dev

db-studio:
	cd backend && npx prisma studio

load-test:
	cd backend && bash scripts/load-test.sh

clean:
	rm -rf backend/node_modules backend/dist mobile/node_modules
