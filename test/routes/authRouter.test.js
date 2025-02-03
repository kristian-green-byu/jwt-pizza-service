const request = require('supertest');
const app = require('../../src/service');

const testUser = { name: 'pizza diner', email: 'reg@test.com', password: 'a' };
const admin = {name: "常用名字", email:"a@jwt.com", password:"admin"}
var loginRes;

if (process.env.VSCODE_INSPECTOR_OPTIONS) {
    jest.setTimeout(60 * 1000 * 5); // 5 minutes
};

beforeAll(async () => {
    testUser.email = Math.random().toString(36).substring(2, 12) + '@test.com';
    loginRes = await request(app).post('/api/auth').send(testUser);
});

test('register', async () => {
    const user = { name: 'pizza diner', email: 'reg@test.com', password: 'a' };
    user.email = Math.random().toString(36).substring(2, 12) + '@test.com';
    const registerRes = await request(app).post('/api/auth').send(user);
    expect(registerRes.status).toBe(200);
    expect(registerRes.body.token).toMatch(/^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/);
    const { password, ...userRes } = { ...user, roles: [{ role: 'diner' }] };
    expect(registerRes.body.user).toMatchObject(userRes);
});

test('register incomplete fields', async () => {
    const user = { name: 'pizza diner', email: null, password: 'a' };
    const registerRes = await request(app).post('/api/auth').send(user);
    expect(registerRes.status).toBe(400);
    expect(registerRes.body.message).toBe("name, email, and password are required");
});

test('login', async () => {
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.token).toMatch(/^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/); 
    const { password, ...user } = { ...testUser, roles: [{ role: 'diner' }] };
    expect(loginRes.body.user).toMatchObject(user);
});

test('login multiple times updates the token rather than causing SQL error', async () => {
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.token).toMatch(/^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/);
    const { password, ...user } = { ...testUser, roles: [{ role: 'diner' }] };
    expect(loginRes.body.user).toMatchObject(user);
    const loginRes2 = await request(app).put('/api/auth').send(testUser); 
    expect(loginRes2.status).toBe(200);
});

test('logout', async () => {
    const logoutRes = await request(app).delete('/api/auth').set('Authorization', `Bearer ${loginRes.body.token}`);
    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body.message).toEqual('logout successful');
});

test('updateUser unauthorized', async () => {
    const loginRes = await request(app).put('/api/auth').send(testUser);
    const updateUser = { name: 'pizza jantar', email: 'reg@test.com', password: 'a' };
    const updateRes = await request(app).put(`/api/auth/${loginRes.body.id}`).send(updateUser).set('Authorization', `Bearer ${loginRes.body.token}`).set('Content-Type', 'application/json');
    expect(updateRes.status).toBe(403);
    expect(updateRes.body.message).toEqual('unauthorized');
});

test('updateUser authorized', async () => {
    const loginAdmin = await request(app).put('/api/auth').send(admin);
    const updateUser = { email: 'a@jwt.com', password: 'admin' };
    const updateRes = await request(app).put(`/api/auth/${loginAdmin.body.user.id}`).send(updateUser).set('Authorization', `Bearer ${loginAdmin.body.token}`).set('Content-Type', 'application/json');
    expect(updateRes.status).toBe(200);
});
