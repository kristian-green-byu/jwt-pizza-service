const request = require('supertest');
const app = require('../../src/service');
const { Role, DB } = require('../../src/database/database.js');

var loginRes;
var franchise;
var franchiseRes;
var storeRes;
var storeObject;
var id;
var storeId;
var normalLoginRes;

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
    return { ...user, password: 'toomanysecrets' };
}
if (process.env.VSCODE_INSPECTOR_OPTIONS) {
    jest.setTimeout(60 * 1000 * 5); // 5 minutes
};

beforeAll(async () => {
    const admin = await createAdminUser();
    loginRes = await request(app).put('/api/auth').send(admin)
    franchise = { name: randomName(), admins: [{ email: admin.email }] }
    franchiseRes = await request(app).post('/api/franchise').set('Content-Type', 'application/json').set('Authorization', `Bearer ${loginRes.body.token}`).send(franchise);
    id = franchiseRes.body.id;
    const storeRequest = { franchiseId: id, name: "test" };
    storeRes = await request(app).post(`/api/franchise/${id}/store`).set("Authorization", `Bearer ${loginRes.body.token}`).set('Content-Type', 'application/json').send(storeRequest);
    storeObject = {franchiseId: id, ...storeRequest}
    storeId = storeRes.body.id;
    const normalUser = await createNormalUser();
    normalLoginRes = await request(app).put('/api/auth').send(normalUser);
})

test("create a new franchise", async () => {
    expect(franchiseRes.status).toBe(200);
    expect(franchiseRes.body).toMatchObject(franchise);
});

test("getFranchises", async () => {
    const res = await request(app).get('/api/franchise');
    expect((res.body.length)).toBeGreaterThan(0);
    expect(typeof res.body[0].id).toBe('number');
    expect(typeof res.body[0].name).toBe('string');
    expect(typeof res.body[0].stores).toBe('object');
});

test("getUserFranchises", async () => {
    const res = await request(app).get(`/api/franchise/${loginRes.body.user.id}`).set("Authorization", `Bearer ${loginRes.body.token}`);
    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject(franchise)
});

test("Create a store", async () => {
    const res = storeRes;
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject(storeObject);
});

test("Delete a store", async () => {
    const res = await request(app).delete(`/api/franchise/${id}/store/${storeId}`).set("Authorization", `Bearer ${loginRes.body.token}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toEqual('store deleted');
});

test("Delete a franchise", async () => {
    const res = await request(app).delete(`/api/franchise/${id}`).set("Authorization", `Bearer ${loginRes.body.token}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toEqual('franchise deleted');
});

test("Create franchise unauthorized", async () => {
    const res = await request(app).post('/api/franchise').set('Content-Type', 'application/json').set('Authorization', `Bearer ${normalLoginRes.body.token}`).send(franchise);
    expect(res.status).toBe(401);
    expect(res.body.message).toEqual('unauthorized');
});
