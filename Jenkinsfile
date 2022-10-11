pipeline {
    agent any
    stages {
        stage('Test Node 12') {
            agent {
                docker {
                    image 'node:12-alpine'
                }
            }
            steps {
                sh 'npm install && npm test'
            }
        }
        stage('Test Node 14') {
            agent {
                docker {
                    image 'node:14-alpine'
                }
            }
            steps {
                sh 'npm install && npm test'
            }
        }
        stage('Test Node 16') {
            agent {
                docker {
                    image 'node:16-alpine'
                }
            }
            steps {
                sh 'npm install && npm test'
            }
        }
        stage('Test Node 18') {
            agent {
                docker {
                    image 'node:18-alpine'
                }
            }
            steps {
                sh 'npm install && npm test'
            }
        }
    }
}