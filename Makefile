install:
	cd backend && npm install

dev:
	cd backend && npm run dev

build:
	cd backend && npm run build

test:
	cd backend && npm test

db-migrate:
	cd backend && npx prisma migrate dev

db-studio:
	cd backend && npx prisma studio

clean:
	rm -rf backend/node_modules backend/dist mobile/node_modules
