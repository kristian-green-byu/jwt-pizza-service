const request = require('supertest');
const app = require('../../src/service');
const { Role, DB } = require('../../src/database/database.js');

var userRes;
var adminRes;
var franchiseRes;
var storeRes;
var orderRes;
var menuId;

function randomName() {
    return Math.random().toString(36).substring(2, 12);
}

async function createAdminUser() {
    let user = { password: 'toomanysecrets', roles: [{ role: Role.Admin }] };
    user.name = randomName();
    user.email = user.name + '@admin.com';

    user = await DB.addUser(user);
    return { ...user, password: 'toomanysecrets' };
}
if (process.env.VSCODE_INSPECTOR_OPTIONS) {
    jest.setTimeout(60 * 1000 * 5); // 5 minutes
};

async function createNormalUser() {
    let user = { password: 'moresecrets', roles: [{ role: Role.Diner }] };
    user.name = randomName();
    user.email = user.name + '@diner.com';

    user = await DB.addUser(user);
    return { ...user, password: 'moresecrets' };
}

if (process.env.VSCODE_INSPECTOR_OPTIONS) {
    jest.setTimeout(60 * 1000 * 5); // 5 minutes
};

beforeAll(async () => {
    const admin = await createAdminUser();
    adminRes = await request(app).put('/api/auth').send(admin)
    const franchise = { name: randomName(), admins: [{ email: admin.email }] }
    franchiseRes = await request(app).post('/api/franchise').set('Content-Type', 'application/json').set('Authorization', `Bearer ${adminRes.body.token}`).send(franchise);
    const storeRequest = { franchiseId: franchiseRes.body.id, name: "test" };
    storeRes = await request(app).post(`/api/franchise/${franchiseRes.body.id}/store`).set("Authorization", `Bearer ${adminRes.body.token}`).set('Content-Type', 'application/json').send(storeRequest);
    const user = await createNormalUser();
    userRes = await request(app).put('/api/auth').send(user);
    const orderReq = { franchiseId: franchiseRes.body.id, storeId: storeRes.body.id, items: [{ menuId: 1, description: "Veggie", price: 0.0038 }] }
    orderRes = await request(app).post('/api/order').set('Content-Type', 'application/json').set('Authorization', `Bearer ${userRes.body.token}`).send(orderReq);
});

test("Get the pizza menu", async () => {
    const res = await request(app).get('/api/order/menu');
    expect(res.status).toBe(200);
    expect(res.body[0]).toEqual({
        id: 1,
        title: 'Veggie',
        image: 'pizza1.png',
        price: 0.0038,
        description: 'A garden of delight'
    });
    expect(res.body[1]).toEqual({
        id: 2,
        title: 'Pepperoni',
        image: 'pizza2.png',
        price: 0.0042,
        description: 'Spicy treat'
    });
    expect(res.body[2]).toEqual({
        id: 3,
        title: 'Margarita',
        image: 'pizza3.png',
        price: 0.0042,
        description: 'Essential classic'
    });
    expect(res.body[3]).toEqual({
        id: 4,
        title: 'Crusty',
        image: 'pizza4.png',
        price: 0.0028,
        description: 'A dry mouthed favorite'
    });
    expect(res.body[4]).toEqual({
        id: 5,
        title: 'Charred Leopard',
        image: 'pizza5.png',
        price: 0.0099,
        description: 'For those with a darker side'
    });
});

test("Create a order for the authenticated user", async () => {
    expect(orderRes.status).toBe(200);
    expect(orderRes.body.order.franchiseId).toEqual(franchiseRes.body.id);
    expect(orderRes.body.order.storeId).toEqual(storeRes.body.id);
    expect(orderRes.body.order.items[0]).toEqual({ menuId: 1, description: "Veggie", price: 0.0038 });
    expect(orderRes.body.jwt).toMatch(/^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/);
    expect(typeof orderRes.body.order.id).toBe('number');
});

test("Get the orders for the authenticated user", async () => {
    const res = await request(app).get('/api/order').set("Authorization", `Bearer ${userRes.body.token}`);
    expect(res.status).toBe(200);
    expect(res.body.dinerId).toEqual(userRes.body.user.id);

    expect(res.body.orders[0].id).toEqual(orderRes.body.order.id);
    expect(res.body.orders[0].franchiseId).toEqual(franchiseRes.body.id);
    expect(res.body.orders[0].storeId).toEqual(storeRes.body.id);
    expect(res.body.orders[0].date).toMatch(/\d{4}-\d{2}-\S*/);
    expect(res.body.orders[0].items[0]).toEqual({ menuId: 1, description: "Veggie", price: 0.0038, id:  orderRes.body.order.id});

    expect(res.body.page).toBe(1);
});

test("Add an item to the menu", async () => {
    const addReq = { title:"test pizza", description: "Boring test pizza made of cardboard", image:"pizza.png", "price": 0.0001 };
    const res = await request(app).put('/api/order/menu').set("Authorization", `Bearer ${adminRes.body.token}`).send(addReq);
    expect(res.status).toBe(200);
    menuId = res.body[res.body.length - 1].id
});

afterAll(async () => {
    if(typeof menuId == 'number'){
        await DB.removeMenuItem(menuId);
    }
});